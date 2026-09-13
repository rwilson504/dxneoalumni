import { useEffect, useState } from 'react';
import {
  duesColumns,
  getSupabase,
  matchesSearch,
  type DuesMember,
  type DuesPayment,
  type DuesRate,
} from '~/lib/supabase';
import { site } from '~/data/site';
import SearchField from './SearchField';

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

export default function OfficerDues({ roster, isAdmin }: { roster: DuesMember[]; isAdmin: boolean }) {
  const [year, setYear] = useState(new Date().getFullYear());
  const [payments, setPayments] = useState<DuesPayment[] | null>(null);
  const [rate, setRate] = useState<DuesRate | null>(null);
  const [rateDraft, setRateDraft] = useState({ chapter: String(site.chapterDues), virtual: String(site.virtualDues) });
  const [savingRate, setSavingRate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let active = true;
    setPayments(null);
    const supabase = getSupabase();
    Promise.all([
      supabase.from('dues_payments').select(duesColumns).eq('year', year),
      supabase.from('dues_rates').select('year, chapter_amount, virtual_amount').eq('year', year).maybeSingle(),
    ]).then(([paymentResult, rateResult]) => {
        if (!active) return;
        const nextRate = rateResult.data as DuesRate | null;
        setError(paymentResult.error?.message ?? rateResult.error?.message ?? null);
        setPayments((paymentResult.data as DuesPayment[]) ?? []);
        setRate(nextRate);
        setRateDraft({
          chapter: String(nextRate?.chapter_amount ?? site.chapterDues),
          virtual: String(nextRate?.virtual_amount ?? site.virtualDues),
        });
      });
    return () => {
      active = false;
    };
  }, [year]);

  async function saveRate() {
    setSavingRate(true);
    const { data, error: saveError } = await getSupabase()
      .from('dues_rates')
      .upsert({
        year,
        chapter_amount: Number(rateDraft.chapter),
        virtual_amount: Number(rateDraft.virtual),
        updated_at: new Date().toISOString(),
      })
      .select('year, chapter_amount, virtual_amount')
      .single();
    setSavingRate(false);
    if (saveError) {
      setError(saveError.message);
      return;
    }
    setError(null);
    setRate(data as DuesRate);
  }

  async function record(member: DuesMember, amount: number, method: string, paidOn: string) {
    const { data, error: err } = await getSupabase()
      .from('dues_payments')
      .insert({ member_id: member.id, year, amount, method, paid_on: paidOn })
      .select(duesColumns)
      .single();

    if (err) {
      setError(err.code === '23505'
        ? `${member.full_name} already has a dues payment recorded for ${year}.`
        : err.message);
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
  const chapterDefault = Number(rate?.chapter_amount ?? site.chapterDues);
  const virtualDefault = Number(rate?.virtual_amount ?? site.virtualDues);
  const filteredRoster = roster.filter((member) => {
    const payment = byMember.get(member.id);
    return matchesSearch(
      query,
      member.full_name,
      member.is_virtual ? 'virtual' : 'full',
      payment ? 'paid' : 'not recorded',
      payment?.amount,
      payment?.method,
      payment?.paid_on,
    );
  });

  return (
    <section className="panel">
      <div className="panel__head">
        <h2>Dues for all members</h2>
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

      <div className="subpanel dues-defaults">
        <h3>Default amounts for {year}</h3>
        <p className="muted">
          These amounts prefill new payment records. An officer can still adjust an individual payment.
        </p>
        <div className="fields fields--compact">
          <label>
            Full member
            <input type="number" min="0" step="0.01" value={rateDraft.chapter}
              disabled={!isAdmin || savingRate}
              onChange={(event) => setRateDraft({ ...rateDraft, chapter: event.target.value })} />
          </label>
          <label>
            Virtual member
            <input type="number" min="0" step="0.01" value={rateDraft.virtual}
              disabled={!isAdmin || savingRate}
              onChange={(event) => setRateDraft({ ...rateDraft, virtual: event.target.value })} />
          </label>
        </div>
        {isAdmin ? (
          <button className="btn btn--primary btn--small" type="button" onClick={saveRate}
            disabled={savingRate || rateDraft.chapter === '' || rateDraft.virtual === ''}>
            {savingRate ? 'Saving…' : 'Save defaults'}
          </button>
        ) : (
          <p className="hint">Only an administrator can change annual defaults.</p>
        )}
        {!rate && <p className="hint">No saved rate for this year. The current site defaults are shown.</p>}
      </div>

      {!payments && <p className="muted">Loading…</p>}

      {payments && (
        <section className="dues-ledger">
          <div className="panel__head">
            <h3>Payments for {year}</h3>
            <p className={paidCount === roster.length ? 'status status--ok' : 'status status--due'}>
              {paidCount} of {roster.length} paid
            </p>
          </div>

          <SearchField value={query} onChange={setQuery} label="Search dues roster"
            resultCount={filteredRoster.length} totalCount={roster.length} />

          <table className="table table--responsive">
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
              {filteredRoster.map((m) => {
                const payment = byMember.get(m.id);
                return (
                  <tr key={m.id}>
                    <td data-label="Member">
                      {m.full_name}
                      {m.is_virtual && <span className="badge">Virtual</span>}
                    </td>
                    {payment ? (
                      <>
                        <td className="paid" data-label="Status">Paid</td>
                        <td data-label="Amount">${Number(payment.amount).toFixed(2)}</td>
                        <td data-label="Method">{payment.method ?? 'Not recorded'}</td>
                        <td data-label="Paid">{payment.paid_on}</td>
                        <td data-label="Actions">
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
                      <RecordCells key={`${m.id}-${year}-${chapterDefault}-${virtualDefault}`}
                        member={m}
                        defaultAmount={m.is_virtual ? virtualDefault : chapterDefault}
                        onRecord={record} />
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filteredRoster.length === 0 && <p className="muted empty-results">No dues records match your search.</p>}
        </section>
      )}
    </section>
  );
}

function RecordCells({
  member,
  defaultAmount,
  onRecord,
}: {
  member: DuesMember;
  defaultAmount: number;
  onRecord: (member: DuesMember, amount: number, method: string, paidOn: string) => Promise<void>;
}) {
  const [amount, setAmount] = useState(String(defaultAmount));
  const [method, setMethod] = useState(METHODS[0]);
  const [paidOn, setPaidOn] = useState(today);
  const [saving, setSaving] = useState(false);
  const validAmount = amount !== '' && Number.isFinite(Number(amount)) && Number(amount) > 0;

  async function submit() {
    if (!validAmount) return;
    setSaving(true);
    await onRecord(member, Number(amount), method, paidOn);
    setSaving(false);
  }

  return (
    <>
      <td className="unpaid" data-label="Status">Not recorded</td>
      <td data-label="Amount">
        <input
          className="cell-input cell-input--amount"
          type="number"
          min="0"
          step="0.01"
          required
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          aria-label={`Amount for ${member.full_name}`}
        />
      </td>
      <td data-label="Method">
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
      <td data-label="Paid">
        <input
          className="cell-input"
          type="date"
          value={paidOn}
          onChange={(e) => setPaidOn(e.target.value)}
          aria-label={`Date paid for ${member.full_name}`}
        />
      </td>
      <td data-label="Actions">
        <button className="btn btn--primary btn--small" type="button" onClick={submit}
          disabled={saving || !validAmount}>
          {saving ? 'Saving…' : 'Record'}
        </button>
      </td>
    </>
  );
}
