"use client";

import { useCallback, useEffect, useState } from "react";
import { extractPdfText } from "@/lib/pdf-client";
import {
  createStudyMaterialStoragePath,
  materialFromRow,
  type MaterialRow,
  type StudyMaterial,
} from "@/lib/pdf-analysis";
import { createStudyQuizSource } from "@/lib/study-quiz";
import type { StudySubject } from "@/lib/study-quests";
import { getSupabaseBrowserClient } from "@/lib/supabase-client";

export type MaterialPhase =
  | "idle"
  | "extracting"
  | "uploading"
  | "indexing"
  | "saving"
  | "error";

function storageUploadErrorMessage(error: unknown) {
  const failure = (error ?? {}) as {
    error?: string;
    message?: string;
    statusCode?: number | string;
  };
  const detail = `${failure.error ?? ""} ${failure.message ?? ""}`.trim();
  const status = Number(failure.statusCode);

  if (status === 401) {
    return "로그인 정보가 만료됐어요. 다시 로그인한 뒤 PDF를 올려 주세요.";
  }
  if (status === 403 || /row.level|policy|permission|unauthorized/i.test(detail)) {
    return "PDF 저장 권한을 확인하지 못했어요. 다시 로그인한 뒤 시도해 주세요.";
  }
  if (/bucket/i.test(detail)) {
    return "PDF 저장소를 찾지 못했어요. 관리자 설정을 확인해 주세요.";
  }
  if (/invalid.*key|invalid.*name|resource.*name/i.test(detail)) {
    return "PDF 저장 경로가 올바르지 않아요.";
  }
  return status
    ? `PDF를 저장하지 못했어요. (Storage ${status})`
    : "PDF를 저장하지 못했어요.";
}

export function useStudyMaterials(enabled: boolean) {
  const client = getSupabaseBrowserClient();
  const [materials, setMaterials] = useState<StudyMaterial[]>([]);
  const [phase, setPhase] = useState<MaterialPhase>("idle");
  const [message, setMessage] = useState("");
  const [pageProgress, setPageProgress] = useState({ completed: 0, total: 0 });

  const refresh = useCallback(async () => {
    if (!client || !enabled) {
      setMaterials([]);
      return;
    }
    const { data, error } = await client
      .from("study_materials")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      setMessage(
        error.code === "42P01"
          ? "PDF 데이터베이스 설정이 필요해요."
          : "자료 목록을 불러오지 못했어요.",
      );
      return;
    }
    setMaterials((data as MaterialRow[]).map(materialFromRow));
  }, [client, enabled]);

  useEffect(() => {
    // Initial remote hydration intentionally updates query state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  const preparePdf = useCallback(
    async (file: File, subject: StudySubject) => {
      if (!client) return null;
      setMessage("");
      setPhase("extracting");
      setPageProgress({ completed: 0, total: 0 });

      let storagePath = "";
      let materialId = "";
      try {
        const extracted = await extractPdfText(file, (completed, total) => {
          setPageProgress({ completed, total });
        });
        const quizSource = createStudyQuizSource(extracted.pages);
        if (!quizSource.pages.length) {
          throw new Error("PDF에서 퀴즈에 사용할 글자를 찾지 못했어요. 스캔 자료인지 확인해 주세요.");
        }
        const {
          data: { session },
        } = await client.auth.getSession();
        const user = session?.user;
        if (!session || !user) throw new Error("로그인이 필요해요.");

        materialId = crypto.randomUUID();
        storagePath = createStudyMaterialStoragePath(user.id, materialId);

        setPhase("uploading");
        const upload = await client.storage
          .from("study-materials")
          .upload(storagePath, file, {
            cacheControl: "3600",
            contentType: "application/pdf",
            upsert: false,
          });
        if (upload.error) {
          throw new Error(storageUploadErrorMessage(upload.error));
        }

        setPhase("indexing");
        const analyzedAt = new Date().toISOString();
        const summary = `${extracted.pageCount}쪽 자료 · ${quizSource.pages.length}쪽에서 복습 퀴즈를 준비했어요.`;
        const inserted = await client
          .from("study_materials")
          .insert({
            id: materialId,
            user_id: user.id,
            subject_id: subject.id,
            file_name: file.name.slice(0, 180),
            storage_path: storagePath,
            file_size_bytes: file.size,
            page_count: extracted.pageCount,
            status: "ready",
            summary,
            analysis: quizSource,
            analysis_provider: "guided",
            analyzed_at: analyzedAt,
          })
          .select()
          .single();
        if (inserted.error) {
          await client.storage.from("study-materials").remove([storagePath]);
          throw new Error("자료 정보를 저장하지 못했어요.");
        }
        const ready = materialFromRow(inserted.data as MaterialRow);
        setMaterials((current) => [ready, ...current]);
        setPhase("idle");
        setMessage("자료가 준비됐어요. 퀘스트에 연결하면 집중이 끝날 때 복습 문제가 나와요.");
        return ready;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "PDF를 준비하지 못했어요.";
        if (materialId) {
          const failedAt = new Date().toISOString();
          const { data } = await client
            .from("study_materials")
            .update({
              status: "failed",
              error_message: errorMessage.slice(0, 500),
              updated_at: failedAt,
            })
            .eq("id", materialId)
            .select()
            .maybeSingle();
          if (data) {
            const failed = materialFromRow(data as MaterialRow);
            setMaterials((current) =>
              current.map((item) => (item.id === failed.id ? failed : item)),
            );
          }
        }
        setPhase("error");
        setMessage(errorMessage);
        return null;
      }
    },
    [client],
  );

  const deleteMaterial = useCallback(
    async (material: StudyMaterial) => {
      if (!client) return false;
      setPhase("saving");
      const removedFile = await client.storage
        .from("study-materials")
        .remove([material.storagePath]);
      if (removedFile.error) {
        setPhase("error");
        setMessage("PDF 파일을 삭제하지 못했어요.");
        return false;
      }
      const removedRow = await client
        .from("study_materials")
        .delete()
        .eq("id", material.id);
      if (removedRow.error) {
        setPhase("error");
        setMessage("자료 기록을 삭제하지 못했어요.");
        return false;
      }
      setMaterials((current) => current.filter((item) => item.id !== material.id));
      setPhase("idle");
      return true;
    },
    [client],
  );

  return {
    preparePdf,
    deleteMaterial,
    materials,
    message,
    pageProgress,
    phase,
    refresh,
  };
}
