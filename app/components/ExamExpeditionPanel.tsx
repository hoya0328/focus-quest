import type {
  ExamExpedition,
  ExamExpeditionReport,
} from "@/lib/study-quests";

export default function ExamExpeditionPanel({
  expedition,
  report,
}: {
  expedition: ExamExpedition;
  report: ExamExpeditionReport;
}) {
  const completionPercent = expedition.totalSets > 0
    ? Math.round((expedition.completedSets / expedition.totalSets) * 100)
    : 0;
  const reportPeak = Math.max(1, ...report.weeks.map((week) => week.minutes));

  return (
    <>
      <section
        className={`exam-expedition state-${expedition.risk}`}
        aria-labelledby="exam-expedition-title"
      >
        <div className="exam-expedition-copy">
          <span>EXAM EXPEDITION</span>
          <h3 id="exam-expedition-title">{expedition.label}</h3>
          <p>{expedition.message}</p>
        </div>
        <div className="exam-expedition-stats">
          <div>
            <strong>{expedition.completedSets}/{expedition.totalSets}</strong>
            <span>통과한 구간</span>
          </div>
          <div>
            <strong>{expedition.dailyMinutes}분</strong>
            <span>하루 권장</span>
          </div>
        </div>
        <span
          aria-label={`시험 원정 ${completionPercent}% 완료`}
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={completionPercent}
          className="exam-expedition-track"
          role="progressbar"
        >
          <i style={{ width: `${completionPercent}%` }} />
        </span>
      </section>

      <section
        className={`expedition-report state-${report.status}`}
        aria-labelledby="expedition-report-title"
      >
        <div className="expedition-report-heading">
          <div>
            <span>4-WEEK ROUTE</span>
            <h3 id="expedition-report-title">{report.headline}</h3>
            <p>{report.message}</p>
          </div>
          <div className="expedition-report-trend" aria-label="최근 7일 변화">
            <strong>{report.recentMinutes}분</strong>
            <small>
              {report.trendMinutes === 0
                ? "지난주와 같아요"
                : `${report.trendMinutes > 0 ? "+" : ""}${report.trendMinutes}분`}
            </small>
          </div>
        </div>
        <div className="expedition-week-chart" aria-label="최근 4주 과목 집중 시간">
          {report.weeks.map((week) => (
            <div key={week.label}>
              <span
                aria-label={`${week.label} ${week.minutes}분`}
                style={{ height: `${Math.max(6, (week.minutes / reportPeak) * 100)}%` }}
              />
              <strong>{week.minutes}분</strong>
              <small>{week.label}</small>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
