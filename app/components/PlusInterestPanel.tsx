"use client";

import { useState } from "react";
import {
  type PlusPriceBand,
  usePlusInterest,
} from "@/app/hooks/usePlusInterest";

const PRICE_OPTIONS: PlusPriceBand[] = [4900, 5900, 6900];

export default function PlusInterestPanel({ enabled }: { enabled: boolean }) {
  const survey = usePlusInterest(enabled);
  const [priceChoice, setPriceChoice] = useState<PlusPriceBand | null>(null);
  const selectedPrice = priceChoice ?? survey.interest?.priceBand ?? 5900;
  const disabled = survey.status === "loading" || survey.status === "saving";

  return (
    <section className="plus-interest-panel" aria-labelledby="plus-interest-title">
      <div className="plus-interest-copy">
        <span>FOCUS QUEST PLUS · RESEARCH</span>
        <h3 id="plus-interest-title">더 깊은 학습 리포트가 생긴다면</h3>
        <p>
          세밀한 복습 계획과 장기 기록을 묶은 Plus를 검토하고 있어요.
          지금은 가격 의견만 받으며 결제나 예약은 진행되지 않습니다.
        </p>
      </div>
      <fieldset disabled={disabled}>
        <legend>부담 없이 써볼 만한 월 가격</legend>
        <div className="plus-price-options">
          {PRICE_OPTIONS.map((price) => (
            <label className={selectedPrice === price ? "is-selected" : ""} key={price}>
              <input
                checked={selectedPrice === price}
                name="plus-price"
                onChange={() => setPriceChoice(price)}
                type="radio"
                value={price}
              />
              월 {price.toLocaleString("ko-KR")}원
            </label>
          ))}
        </div>
      </fieldset>
      <div className="plus-interest-actions">
        <button
          className="quest-primary"
          disabled={disabled}
          onClick={() => void survey.save("interested", selectedPrice)}
          type="button"
        >
          이 가격이면 관심 있어요
        </button>
        <button
          disabled={disabled}
          onClick={() => void survey.save("not_now", null)}
          type="button"
        >
          아직은 아니에요
        </button>
      </div>
      <small aria-live="polite">
        {survey.message || (survey.interest?.level === "interested"
          ? `저장한 의견: 월 ${survey.interest.priceBand?.toLocaleString("ko-KR")}원`
          : survey.interest?.level === "not_now"
            ? "저장한 의견: 아직은 아니에요"
            : "응답은 내 계정에만 저장되며 언제든 바꿀 수 있어요.")}
      </small>
    </section>
  );
}
