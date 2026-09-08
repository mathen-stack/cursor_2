"use client";

import { useMemo, useState } from "react";
import { removeTailorRecord } from "@/app/actions/admin";
import type { AdminTailorRecord } from "@/app/actions/admin";

function formatWhen(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export default function TailoringRecords({
  records,
  users,
  busy,
  onBusy,
  onRecordsChange,
}: {
  records: AdminTailorRecord[];
  users: { id: string; name: string; email: string }[];
  busy: boolean;
  onBusy: (label: string, work: () => Promise<void>) => Promise<void>;
  onRecordsChange: (update: (current: AdminTailorRecord[]) => AdminTailorRecord[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [userId, setUserId] = useState("all");
  const [openId, setOpenId] = useState<string | null>(null);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return records.filter((record) => {
      if (userId !== "all" && record.userId !== userId) return false;
      if (!needle) return true;
      return [
        record.userName,
        record.userEmail,
        record.company,
        record.jobTitle,
        record.jobDescription,
        record.error,
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [query, records, userId]);

  return (
    <section className="composer">
      <div className="section-head">
        <div>
          <h2>Tailoring records</h2>
          <p className="hint">
            Every generate attempt across accounts — successful packages and
            failures.
          </p>
        </div>
      </div>

      <div className="field-grid">
        <div className="field">
          <label htmlFor="record-search">Search</label>
          <input
            id="record-search"
            value={query}
            disabled={busy}
            placeholder="User, company, role, or JD text"
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="record-user">User</label>
          <select
            id="record-user"
            value={userId}
            disabled={busy}
            onChange={(event) => setUserId(event.target.value)}
          >
            <option value="all">All users ({records.length})</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name} · {user.email}
              </option>
            ))}
          </select>
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="hint">No tailoring records match that filter.</p>
      ) : (
        <ul className="record-list">
          {visible.map((record) => {
            const open = openId === record.id;
            return (
              <li key={record.id} className="record-card">
                <div className="record-head">
                  <div>
                    <p className="record-title">
                      {record.company || record.jobTitle
                        ? `${record.company || "Unknown company"} · ${record.jobTitle || "Untitled role"}`
                        : "Failed generate"}
                    </p>
                    <p className="record-meta">
                      {record.userName}
                      {record.userEmail ? ` · ${record.userEmail}` : ""}
                      {` · ${formatWhen(record.createdAt)}`}
                    </p>
                  </div>
                  <span
                    className={`record-status${
                      record.status === "done" ? "" : " record-status-error"
                    }`}
                  >
                    {record.status === "done"
                      ? `ATS ${record.atsScore ?? "—"}/100`
                      : "Failed"}
                  </span>
                </div>

                {record.error && <p className="error">{record.error}</p>}

                <div className="download-actions record-actions">
                  <button
                    type="button"
                    className="text-btn"
                    disabled={busy}
                    onClick={() => setOpenId(open ? null : record.id)}
                  >
                    {open ? "Hide details" : "Details"}
                  </button>
                  {record.status === "done" && record.folderName && record.resumeDocxName && (
                    <a
                      className="download-btn"
                      href={`/api/download?folder=${encodeURIComponent(record.folderName)}&name=${encodeURIComponent(record.resumeDocxName)}`}
                    >
                      Resume
                    </a>
                  )}
                  {record.status === "done" &&
                    record.folderName &&
                    record.coverLetterDocxName && (
                      <a
                        className="download-btn"
                        href={`/api/download?folder=${encodeURIComponent(record.folderName)}&name=${encodeURIComponent(record.coverLetterDocxName)}`}
                      >
                        Cover letter
                      </a>
                    )}
                  {record.status === "done" && record.zipName && (
                    <a
                      className="download-btn"
                      href={`/api/download?file=${encodeURIComponent(record.zipName)}`}
                    >
                      Zip
                    </a>
                  )}
                  <button
                    type="button"
                    className="text-btn danger-btn"
                    disabled={busy}
                    onClick={() => {
                      if (
                        !window.confirm(
                          "Delete this tailoring record and its files?",
                        )
                      ) {
                        return;
                      }
                      void onBusy("Tailoring record deleted.", async () => {
                        await removeTailorRecord(record.id);
                        onRecordsChange((current) =>
                          current.filter((entry) => entry.id !== record.id),
                        );
                        if (openId === record.id) setOpenId(null);
                      });
                    }}
                  >
                    Delete
                  </button>
                </div>

                {open && (
                  <div className="record-details">
                    {record.extracted && (
                      <p className="hint">
                        {record.extracted.summary}
                        {record.extracted.hardTechnicalSkills.length
                          ? ` Skills: ${record.extracted.hardTechnicalSkills.slice(0, 8).join(", ")}`
                          : ""}
                      </p>
                    )}
                    <label className="field">
                      <span>Job description</span>
                      <textarea
                        readOnly
                        value={record.jobDescription}
                        rows={8}
                      />
                    </label>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
