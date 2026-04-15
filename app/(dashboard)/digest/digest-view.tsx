"use client";

import {
  Users,
  MessageSquare,
  Database,
  AlertTriangle,
  ThumbsUp,
  ThumbsDown,
  MessageCircle,
  TrendingUp,
} from "lucide-react";

interface DigestData {
  digest_date: string;
  generated_at: string;
  users: {
    new_profiles: Array<{
      id: string;
      role: string;
      postal_code: string;
      created_at: string;
    }>;
    new_count: number;
    total_active: number;
  };
  chat: {
    total_messages: number;
    unique_users: number;
    threads_active: number;
    avg_messages_per_thread: number;
  };
  data_collected: {
    total_records: number;
    by_type: Array<{ data_type: string; count: number }>;
    by_grain: Array<{ grain: string; count: number }>;
  };
  feedback: {
    total: number;
    by_type: Array<{ feedback_type: string; count: number }>;
    high_severity: number;
    unresolved: number;
    recent_messages: Array<{
      feedback_type: string;
      farmer_message: string | null;
      bushy_context: string | null;
      severity: string;
      created_at: string;
    }>;
  };
  area_stance_changes: Array<{
    fsa_code: string;
    grain: string;
    report_count: number;
  }>;
}

interface DigestViewProps {
  data: DigestData;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-CA", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function feedbackIcon(type: string) {
  switch (type) {
    case "frustration":
      return <AlertTriangle className="h-3.5 w-3.5 text-red-500" />;
    case "praise":
      return <ThumbsUp className="h-3.5 w-3.5 text-prairie" />;
    case "correction":
      return <ThumbsDown className="h-3.5 w-3.5 text-amber-500" />;
    case "feature_request":
      return <MessageCircle className="h-3.5 w-3.5 text-blue-500" />;
    case "bug_report":
      return <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />;
    default:
      return <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />;
  }
}

function severityBadge(severity: string) {
  const colors: Record<string, string> = {
    high: "bg-red-500/15 text-red-600",
    medium: "bg-amber-500/15 text-amber-600",
    low: "bg-prairie/15 text-prairie",
  };
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${colors[severity] ?? colors.low}`}
    >
      {severity}
    </span>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-[0_4px_16px_rgba(0,0,0,0.06),0_1px_3px_rgba(0,0,0,0.04)] dark:bg-wheat-900/80">
      <div className="mb-3 flex items-center gap-2">
        {icon}
        <h2 className="text-sm font-bold text-foreground">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function StatPill({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl bg-wheat-50 px-3 py-2 dark:bg-wheat-800/50">
      <div className="text-lg font-bold text-foreground">{value}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}

export function DigestView({ data }: DigestViewProps) {
  const praiseCount =
    data.feedback.by_type.find((t) => t.feedback_type === "praise")?.count ?? 0;
  const negativeCount = data.feedback.total - praiseCount;
  const positiveRate =
    data.feedback.total > 0
      ? Math.round((praiseCount / data.feedback.total) * 100)
      : 0;

  return (
    <div className="mx-auto max-w-3xl space-y-4 py-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-foreground">
          Bushels Daily Digest
        </h1>
        <p className="text-sm text-muted-foreground">
          {formatDate(data.digest_date)}
        </p>
      </div>

      {/* Users */}
      <Section title="Users" icon={<Users className="h-4 w-4 text-canola" />}>
        <div className="grid grid-cols-3 gap-3">
          <StatPill label="New today" value={data.users.new_count} />
          <StatPill label="Total active" value={data.users.total_active} />
          <StatPill
            label="Conversations"
            value={data.chat.threads_active}
          />
        </div>
        {data.users.new_profiles.length > 0 && (
          <div className="mt-3 space-y-1">
            {data.users.new_profiles.map((p) => (
              <div
                key={p.id}
                className="text-xs text-muted-foreground"
              >
                New {p.role} — {p.postal_code}
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Chat Stats */}
      <Section
        title="Conversations"
        icon={<MessageSquare className="h-4 w-4 text-canola" />}
      >
        <div className="grid grid-cols-4 gap-3">
          <StatPill label="Messages" value={data.chat.total_messages} />
          <StatPill label="Users chatting" value={data.chat.unique_users} />
          <StatPill label="Threads" value={data.chat.threads_active} />
          <StatPill
            label="Avg turns"
            value={data.chat.avg_messages_per_thread}
          />
        </div>
      </Section>

      {/* Data Collected */}
      <Section
        title="Data Collected"
        icon={<Database className="h-4 w-4 text-canola" />}
      >
        <StatPill
          label="New local intel records"
          value={data.data_collected.total_records}
        />
        {data.data_collected.by_type.length > 0 && (
          <div className="mt-3 space-y-1">
            {data.data_collected.by_type.map((t) => (
              <div key={t.data_type} className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{t.data_type}</span>
                <span className="font-medium text-foreground">{t.count}</span>
              </div>
            ))}
          </div>
        )}
        {data.data_collected.by_grain.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {data.data_collected.by_grain.map((g) => (
              <span
                key={g.grain}
                className="rounded-full bg-canola/10 px-2 py-0.5 text-[10px] font-medium text-canola"
              >
                {g.grain} ({g.count})
              </span>
            ))}
          </div>
        )}
      </Section>

      {/* Thesis Impacts */}
      {data.area_stance_changes.length > 0 && (
        <Section
          title="Thesis Impacts"
          icon={<TrendingUp className="h-4 w-4 text-canola" />}
        >
          <p className="mb-2 text-xs text-muted-foreground">
            Areas with 3+ new reports — may warrant thesis rerun:
          </p>
          <div className="space-y-1.5">
            {data.area_stance_changes.map((a) => (
              <div
                key={`${a.fsa_code}-${a.grain}`}
                className="flex items-center justify-between rounded-lg bg-canola/5 px-3 py-2 text-sm"
              >
                <span className="font-medium text-foreground">
                  {a.fsa_code} — {a.grain}
                </span>
                <span className="text-xs text-muted-foreground">
                  {a.report_count} reports
                </span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Feedback */}
      <Section
        title="Feedback"
        icon={<MessageCircle className="h-4 w-4 text-canola" />}
      >
        <div className="grid grid-cols-4 gap-3">
          <StatPill label="Total" value={data.feedback.total} />
          <StatPill
            label="Positive rate"
            value={data.feedback.total > 0 ? `${positiveRate}%` : "—"}
          />
          <StatPill label="High severity" value={data.feedback.high_severity} />
          <StatPill label="Unresolved" value={data.feedback.unresolved} />
        </div>

        {/* Feedback type breakdown */}
        {data.feedback.by_type.length > 0 && (
          <div className="mt-3 space-y-1">
            {data.feedback.by_type.map((t) => (
              <div
                key={t.feedback_type}
                className="flex items-center gap-2 text-xs"
              >
                {feedbackIcon(t.feedback_type)}
                <span className="text-muted-foreground">{t.feedback_type}</span>
                <span className="ml-auto font-medium text-foreground">
                  {t.count}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Recent feedback messages */}
        {data.feedback.recent_messages.length > 0 && (
          <div className="mt-4 space-y-2">
            <h3 className="text-xs font-medium text-muted-foreground">
              Recent feedback
            </h3>
            {data.feedback.recent_messages.map((f, i) => (
              <div
                key={i}
                className="rounded-lg border border-border/50 bg-wheat-50/50 p-3 dark:bg-wheat-800/30"
              >
                <div className="flex items-center gap-2">
                  {feedbackIcon(f.feedback_type)}
                  <span className="text-xs font-medium text-foreground">
                    {f.feedback_type}
                  </span>
                  {severityBadge(f.severity)}
                  <span className="ml-auto text-[10px] text-muted-foreground">
                    {new Date(f.created_at).toLocaleTimeString("en-CA", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                {f.farmer_message && (
                  <p className="mt-1.5 text-xs text-foreground">
                    {f.farmer_message}
                  </p>
                )}
                {f.bushy_context && (
                  <p className="mt-1 text-[11px] italic text-muted-foreground">
                    Bushy was: {f.bushy_context}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
