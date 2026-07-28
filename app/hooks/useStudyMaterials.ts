"use client";

import { useCallback, useEffect, useState } from "react";
import { extractPdfText } from "@/lib/pdf-client";
import {
  createStudyMaterialStoragePath,
  materialFromRow,
  parsePdfAnalysis,
  sanitizePdfAnalysisForStorage,
  type MaterialRow,
  type PdfAnalysis,
  type StudyMaterial,
} from "@/lib/pdf-analysis";
import type { StudySubject } from "@/lib/study-quests";
import { getSupabaseBrowserClient } from "@/lib/supabase-client";

export type MaterialPhase =
  | "idle"
  | "extracting"
  | "uploading"
  | "analyzing"
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

function analysisSaveErrorMessage(error: unknown) {
  const failure = (error ?? {}) as {
    code?: string;
    message?: string;
  };
  if (failure.code === "23514") {
    return "분석 결과가 저장 범위를 벗어났어요. 내용을 줄여서 다시 시도해 주세요.";
  }
  if (failure.code === "22P05" || failure.code === "22021") {
    return "PDF에서 저장할 수 없는 문자를 발견했어요.";
  }
  return failure.code
    ? `분석 결과를 저장하지 못했어요. (DB ${failure.code})`
    : "분석 결과를 저장하지 못했어요.";
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

  const analyzePdf = useCallback(
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
            status: "analyzing",
          })
          .select()
          .single();
        if (inserted.error) {
          await client.storage.from("study-materials").remove([storagePath]);
          throw new Error("자료 정보를 저장하지 못했어요.");
        }
        const pending = materialFromRow(inserted.data as MaterialRow);
        setMaterials((current) => [pending, ...current]);

        setPhase("analyzing");
        const response = await fetch("/api/analyze-pdf", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            fileName: file.name,
            pageCount: extracted.pageCount,
            pages: extracted.pages,
            subjectGoal: subject.goal,
            subjectName: subject.name,
          }),
        });
        const payload = (await response.json()) as {
          analysis?: unknown;
          error?: string;
        };
        if (!response.ok) {
          throw new Error(payload.error || "PDF 분석에 실패했어요.");
        }
        const analysis = parsePdfAnalysis(payload.analysis);
        if (!analysis) throw new Error("분석 결과 형식이 올바르지 않아요.");

        setPhase("saving");
        const analyzedAt = new Date().toISOString();
        const persistedAnalysis = sanitizePdfAnalysisForStorage(analysis);
        const updated = await client
          .from("study_materials")
          .update({
            status: "ready",
            summary: persistedAnalysis.summary,
            analysis: persistedAnalysis,
            analysis_provider: persistedAnalysis.provider,
            error_message: "",
            analyzed_at: analyzedAt,
            updated_at: analyzedAt,
          })
          .eq("id", materialId)
          .eq("user_id", user.id);
        if (updated.error) {
          throw new Error(analysisSaveErrorMessage(updated.error));
        }
        const ready: StudyMaterial = {
          ...pending,
          status: "ready",
          summary: persistedAnalysis.summary,
          analysis: persistedAnalysis,
          analysisProvider: persistedAnalysis.provider,
          errorMessage: "",
          updatedAt: analyzedAt,
          analyzedAt,
        };
        setMaterials((current) =>
          current.map((item) => (item.id === ready.id ? ready : item)),
        );
        setPhase("idle");
        setMessage(
          analysis.provider === "openai"
            ? "AI가 퀘스트 초안을 만들었어요."
            : "자료의 제목과 핵심어를 바탕으로 퀘스트 초안을 만들었어요.",
        );
        return ready;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "PDF 분석에 실패했어요.";
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

  const updateAnalysis = useCallback(
    async (materialId: string, analysis: PdfAnalysis) => {
      if (!client) return false;
      setPhase("saving");
      const { data, error } = await client
        .from("study_materials")
        .update({
          analysis,
          summary: analysis.summary,
          updated_at: new Date().toISOString(),
        })
        .eq("id", materialId)
        .select()
        .single();
      if (error) {
        setPhase("error");
        setMessage("수정한 분석을 저장하지 못했어요.");
        return false;
      }
      const updated = materialFromRow(data as MaterialRow);
      setMaterials((current) =>
        current.map((item) => (item.id === materialId ? updated : item)),
      );
      setPhase("idle");
      return true;
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
    analyzePdf,
    deleteMaterial,
    materials,
    message,
    pageProgress,
    phase,
    refresh,
    updateAnalysis,
  };
}
