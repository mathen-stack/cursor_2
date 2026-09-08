"use client";

import { useMemo, useState } from "react";
import CandidateForm from "@/components/CandidateForm";
import TailoringRecords from "@/components/TailoringRecords";
import {
  createAccount,
  removeAccount,
  saveAccountProfile,
  updateAccount,
  type AdminTailorRecord,
} from "@/app/actions/admin";
import { isProfileReady } from "@/lib/profile";
import type { CandidateProfile } from "@/lib/types";
import type { PublicUser, UserRole } from "@/lib/users";

function actionError(err: unknown) {
  return err instanceof Error ? err.message : "Administrator action failed.";
}

function AccountEditor({
  adminId,
  selected,
  busy,
  onBusy,
  onUsersChange,
}: {
  adminId: string;
  selected: PublicUser;
  busy: boolean;
  onBusy: (label: string, work: () => Promise<void>) => Promise<void>;
  onUsersChange: (
    update: (current: PublicUser[]) => PublicUser[],
    nextSelectedId?: string,
  ) => void;
}) {
  const [name, setName] = useState(selected.name);
  const [email, setEmail] = useState(selected.email);
  const [role, setRole] = useState<UserRole>(selected.role);
  const [password, setPassword] = useState("");
  const [profile, setProfile] = useState<CandidateProfile>(selected.profile);

  return (
    <>
      <div className="section-head">
        <div>
          <h2>Account</h2>
          <p className="hint">
            Login and sign-up details for this account. Tailoring history is on
            the Tailoring tab.
          </p>
        </div>
      </div>

      <div className="field-grid">
        <div className="field">
          <label htmlFor="account-name">Name</label>
          <input
            id="account-name"
            value={name}
            disabled={busy}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="account-email">Email</label>
          <input
            id="account-email"
            type="email"
            value={email}
            disabled={busy}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="account-role">Role</label>
          <select
            id="account-role"
            value={role}
            disabled={busy || selected.id === adminId}
            onChange={(event) => setRole(event.target.value as UserRole)}
          >
            <option value="user">user</option>
            <option value="admin">admin</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="account-password">New password</label>
          <input
            id="account-password"
            type="password"
            value={password}
            disabled={busy}
            placeholder="Leave blank to keep"
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>
      </div>

      <div className="composer-footer">
        <button
          type="button"
          className="primary"
          disabled={busy}
          onClick={() => {
            void onBusy("Account saved.", async () => {
              const updated = await updateAccount(selected.id, {
                name,
                email,
                role,
                password: password || undefined,
              });
              onUsersChange((current) =>
                current.map((user) =>
                  user.id === updated.id ? { ...updated, profile } : user,
                ),
              );
              setPassword("");
            });
          }}
        >
          Save account
        </button>
        <button
          type="button"
          className="text-btn danger-btn"
          disabled={busy || selected.id === adminId}
          onClick={() => {
            if (
              !window.confirm(`Delete ${selected.email}? This cannot be undone.`)
            ) {
              return;
            }
            void onBusy("Account deleted.", async () => {
              const removedId = selected.id;
              await removeAccount(removedId);
              onUsersChange(
                (current) => current.filter((user) => user.id !== removedId),
                undefined,
              );
            });
          }}
        >
          Delete account
        </button>
      </div>

      <div className="section-head section-head-follow">
        <div>
          <h2>Profile</h2>
          <p className="hint">
            Saved to this account. They will see it on the Profile tab.
          </p>
        </div>
      </div>

      <CandidateForm
        profile={profile}
        disabled={busy}
        onChange={setProfile}
      />

      <div className="composer-footer">
        <button
          type="button"
          className="primary"
          disabled={busy}
          onClick={() => {
            void onBusy("Profile saved.", async () => {
              await saveAccountProfile(selected.id, profile);
              onUsersChange((current) =>
                current.map((user) =>
                  user.id === selected.id ? { ...user, profile } : user,
                ),
              );
            });
          }}
        >
          Save profile
        </button>
      </div>
    </>
  );
}

export default function AdminPanel({
  adminId,
  initialUsers,
  initialRecords,
}: {
  adminId: string;
  initialUsers: PublicUser[];
  initialRecords: AdminTailorRecord[];
}) {
  const [tab, setTab] = useState<"accounts" | "tailoring">("accounts");
  const [users, setUsers] = useState(initialUsers);
  const [records, setRecords] = useState(initialRecords);
  const [selectedId, setSelectedId] = useState(initialUsers[0]?.id ?? "");
  const [query, setQuery] = useState("");
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<UserRole>("user");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selected = users.find((user) => user.id === selectedId) ?? null;

  const visibleUsers = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return users;
    return users.filter(
      (user) =>
        user.name.toLowerCase().includes(needle) ||
        user.email.toLowerCase().includes(needle),
    );
  }, [query, users]);

  async function run(label: string, work: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await work();
      setMessage(label);
    } catch (err) {
      setError(actionError(err));
    } finally {
      setBusy(false);
    }
  }

  function changeUsers(
    update: (current: PublicUser[]) => PublicUser[],
    nextSelectedId?: string,
  ) {
    const next = update(users);
    setUsers(next);
    setRecords((current) =>
      current.filter((record) => next.some((user) => user.id === record.userId)),
    );
    if (nextSelectedId !== undefined) {
      setSelectedId(nextSelectedId);
    } else if (!next.some((user) => user.id === selectedId)) {
      setSelectedId(next[0]?.id ?? "");
    }
  }

  const recordCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const record of records) {
      counts.set(record.userId, (counts.get(record.userId) || 0) + 1);
    }
    return counts;
  }, [records]);

  return (
    <div className="admin-page">
      <div className="tabs" role="tablist" aria-label="Administrator">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "accounts"}
          className={`tab${tab === "accounts" ? " active" : ""}`}
          onClick={() => setTab("accounts")}
        >
          Accounts
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "tailoring"}
          className={`tab${tab === "tailoring" ? " active" : ""}`}
          onClick={() => setTab("tailoring")}
        >
          Tailoring
          <span className="tab-meta">{records.length}</span>
        </button>
      </div>

      {tab === "tailoring" && (
        <>
          <TailoringRecords
            records={records}
            users={users}
            busy={busy}
            onBusy={run}
            onRecordsChange={(update) => setRecords(update(records))}
          />
          {message && <p className="inline-status">{message}</p>}
          {error && <p className="error">{error}</p>}
        </>
      )}

      {tab === "accounts" && (
        <>
      <section className="composer">
        <div className="section-head">
          <div>
            <h2>Create account</h2>
            <p className="hint">
              Admin-created accounts can sign in immediately. The first account
              on an empty site is always an administrator.
            </p>
          </div>
        </div>
        <div className="field-grid">
          <div className="field">
            <label htmlFor="new-name">Name</label>
            <input
              id="new-name"
              value={newName}
              disabled={busy}
              onChange={(event) => setNewName(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="new-email">Email</label>
            <input
              id="new-email"
              type="email"
              value={newEmail}
              disabled={busy}
              onChange={(event) => setNewEmail(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="new-password">Password</label>
            <input
              id="new-password"
              type="password"
              value={newPassword}
              disabled={busy}
              onChange={(event) => setNewPassword(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="new-role">Role</label>
            <select
              id="new-role"
              value={newRole}
              disabled={busy}
              onChange={(event) => setNewRole(event.target.value as UserRole)}
            >
              <option value="user">user</option>
              <option value="admin">admin</option>
            </select>
          </div>
        </div>
        <div className="composer-footer">
          <button
            type="button"
            className="primary"
            disabled={busy}
            onClick={() => {
              void run("Account created.", async () => {
                const created = await createAccount({
                  name: newName,
                  email: newEmail,
                  password: newPassword,
                  role: newRole,
                });
                changeUsers((current) => [...current, created], created.id);
                setNewName("");
                setNewEmail("");
                setNewPassword("");
                setNewRole("user");
              });
            }}
          >
            Create account
          </button>
        </div>
      </section>

      <div className="admin-layout">
        <aside className="composer admin-user-list" aria-label="Users">
          <div className="section-head">
            <div>
              <h2>Users</h2>
              <p className="hint">{users.length} accounts</p>
            </div>
          </div>
          <div className="field">
            <label htmlFor="user-search">Search</label>
            <input
              id="user-search"
              value={query}
              disabled={busy}
              placeholder="Name or email"
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          {visibleUsers.length === 0 ? (
            <p className="hint">No users match that search.</p>
          ) : (
            <ul className="admin-users">
              {visibleUsers.map((user) => (
                <li key={user.id}>
                  <button
                    type="button"
                    className={`admin-user-item${
                      user.id === selectedId ? " active" : ""
                    }`}
                    disabled={busy}
                    onClick={() => {
                      setSelectedId(user.id);
                      setMessage(null);
                      setError(null);
                    }}
                  >
                    <span className="admin-user-name">{user.name}</span>
                    <span className="admin-user-email">{user.email}</span>
                    <span className="admin-user-meta">
                      {user.role}
                      {isProfileReady(user.profile)
                        ? " · Ready"
                        : " · Incomplete"}
                      {` · ${recordCounts.get(user.id) || 0} jobs`}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <section className="composer admin-editor">
          {selected ? (
            <AccountEditor
              key={selected.id}
              adminId={adminId}
              selected={selected}
              busy={busy}
              onBusy={run}
              onUsersChange={changeUsers}
            />
          ) : (
            <p className="hint">Create an account to start the user list.</p>
          )}

          {message && <p className="inline-status">{message}</p>}
          {error && <p className="error">{error}</p>}
        </section>
      </div>
        </>
      )}
    </div>
  );
}
