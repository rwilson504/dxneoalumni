import { useEffect, useState } from 'react';
import { duesColumns, getSupabase, type DuesPayment, type Member } from '~/lib/supabase';
import { site } from '~/data/site';

const METHODS = ['PayPal', 'Check', 'Cash', 'Other'];

/** The chapter was chartered in 2016, so there are no dues before then. */
const FIRST_YEAR = 2016;

function yearOptions(): number[] {
  const latest = new Date().getFullYear() + 1;
  return Array.from({ length: latest - FIRST_YEAR + 1 }, (_, i) => latest - i);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function OfficerDues({ roster }: { roster: Member[] }) {
  const [year, setYear] = useState(new Date().getFullYear());
  const [payments, setPayments] = useState<DuesPayment[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setPayments(null);
    getSupabase()
      .from('dues_payments')
      .select(duesColumns)
      .eq('year', year)
      .then(({ data, error: err }) => {
        if (!active) return;
        setError(err?.message ?? null);
        setPayments((data as DuesPayment[]) ?? []);
      });
    return () => {
      active = false;
    };
  }, [year]);

  async function record(member: Member, amount: number, method: string, paidOn: string) {
    const { data, error: err } = await getSupabase()
      .from('dues_payments')
      .insert({ member_id: member.id, year, amount, method, paid_on: paidOn })
      .select(duesColumns)
      .single();

    if (err) {
      setError(err.message);
      return;
    }
    setError(null);
    setPayments((prev) => [...(prev ?? []), data as DuesPayment]);
  }

  async function remove(payment: DuesPayment, name: string) {
    if (!window.confirm(`Remove the ${payment.year} dues payment for ${name}?`)) return;

    const { error: err } = await getSupabase().from('dues_payments').delete().eq('id', payment.id);
    if (err) {
      setError(err.message);
      return;
    }
    setError(null);
    setPayments((prev) => (prev ?? []).filter((p) => p.id !== payment.id));
  }

  const byMember = new Map((payments ?? []).map((p) => [p.member_id, p]));
  const paidCount = roster.filter((m) => byMember.has(m.id)).length;

  return (
    <section className="panel">
      <div className="panel__head">
        <h2>Dues — all members</h2>
        <label className="inline-field">
          Year
          <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {yearOptions().map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && <p className="error">{error}</p>}

      {!payments && <p className="muted">Loading…</p>}

      {payments && (
        <>
          <p className={paidCount === roster.length ? 'status status--ok' : 'status status--due'}>
            {paidCount} of {roster.length} paid for {year}
          </p>

          <table className="table">
            <thead>
              <tr>
                <th>Member</th>
                <th>Status</th>
                <th>Amount</th>
                <th>Method</th>
                <th>Paid</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {roster.map((m) => {
                const payment = byMember.get(m.id);
                return (
                  <tr key={m.id}>
                    <td>
                      {m.full_name}
                      {m.is_virtual && <span className="badge">Virtual</span>}
                    </td>
                    {payment ? (
                      <>
                        <td className="paid">Paid</td>
                        <td>${Number(payment.amount).toFixed(2)}</td>
                        <td>{payment.method ?? '—'}</td>
                        <td>{payment.paid_on}</td>
                        <td>
                          <button
                            className="btn btn--ghost btn--small"
                            type="button"
                            onClick={() => remove(payment, m.full_name)}
                          >
                            Remove
                          </button>
                        </td>
                      </>
                    ) : (
                      <RecordCells member={m} onRecord={record} />
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}

function RecordCells({
  member,
  onRecord,
}: {
  member: Member;
  onRecord: (member: Member, amount: number, method: string, paidOn: string) => Promise<void>;
}) {
  const [amount, setAmount] = useState(String(member.is_virtual ? site.virtualDues : site.chapterDues));
  const [method, setMethod] = useState(METHODS[0]);
  const [paidOn, setPaidOn] = useState(today);
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    await onRecord(member, Number(amount), method, paidOn);
    setSaving(false);
  }

  return (
    <>
      <td className="unpaid">Not recorded</td>
      <td>
        <input
          className="cell-input cell-input--amount"
          type="number"
          min="0"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          aria-label={`Amount for ${member.full_name}`}
        />
      </td>
      <td>
        <select
          className="cell-input"
          value={method}
          onChange={(e) => setMethod(e.target.value)}
          aria-label={`Method for ${member.full_name}`}
        >
          {METHODS.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
      </td>
      <td>
        <input
          className="cell-input"
          type="date"
          value={paidOn}
          onChange={(e) => setPaidOn(e.target.value)}
          aria-label={`Date paid for ${member.full_name}`}
        />
      </td>
      <td>
        <button className="btn btn--primary btn--small" type="button" onClick={submit} disabled={saving}>
          {saving ? 'Saving…' : 'Record'}
        </button>
      </td>
    </>
  );
}
