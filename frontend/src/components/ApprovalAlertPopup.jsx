import { useCallback, useEffect, useRef, useState } from 'react';
import { sessionFetch } from '../utils/sessionFetch';
import './ApprovalAlertPopup.css';

export default function ApprovalAlertPopup() {
  const [approvals, setApprovals] = useState([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const audioContextRef = useRef(null);
  const activeApproval = approvals[0];
  const activeApprovalId = activeApproval?.id;
  const activeApprovalTitle = activeApproval?.title;
  const activeApprovalMessage = activeApproval?.message;

  const loadApprovals = useCallback(async () => {
    try {
      const response = await sessionFetch('/attendance/approval-alerts');
      const data = await response.json();
      if (response.ok && data.status === 'success') setApprovals(data.approvals || []);
    } catch {
      // Session expiry is handled globally; polling errors remain unobtrusive.
    }
  }, []);

  useEffect(() => {
    const initialTimeout = window.setTimeout(loadApprovals, 0);
    const intervalId = window.setInterval(loadApprovals, 8000);
    return () => {
      window.clearTimeout(initialTimeout);
      window.clearInterval(intervalId);
    };
  }, [loadApprovals]);

  useEffect(() => {
    const unlockAudio = () => {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      if (!audioContextRef.current) audioContextRef.current = new AudioContext();
      audioContextRef.current.resume?.();
    };
    document.addEventListener('pointerdown', unlockAudio, { once: true });
    return () => document.removeEventListener('pointerdown', unlockAudio);
  }, []);

  useEffect(() => {
    if (!activeApprovalId) return undefined;

    const playRing = () => {
      const context = audioContextRef.current;
      if (!context || context.state !== 'running') return;
      [0, 0.22].forEach(offset => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.value = 880;
        gain.gain.setValueAtTime(0.0001, context.currentTime + offset);
        gain.gain.exponentialRampToValueAtTime(0.22, context.currentTime + offset + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + offset + 0.18);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(context.currentTime + offset);
        oscillator.stop(context.currentTime + offset + 0.2);
      });
    };

    playRing();
    navigator.vibrate?.([450, 180, 450, 500, 450, 180, 450]);
    const ringInterval = window.setInterval(playRing, 2800);
    const vibrationInterval = window.setInterval(
      () => navigator.vibrate?.([450, 180, 450]),
      3200,
    );
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(activeApprovalTitle, { body: activeApprovalMessage, tag: `approval-${activeApprovalId}` });
    }

    return () => {
      window.clearInterval(ringInterval);
      window.clearInterval(vibrationInterval);
      navigator.vibrate?.(0);
    };
  }, [activeApprovalId, activeApprovalMessage, activeApprovalTitle]);

  const decide = async decision => {
    if (!activeApproval || busy) return;
    setBusy(true);
    try {
      const response = await sessionFetch(`/attendance/approval-alerts/${activeApproval.id}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, note }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to save decision');
      setApprovals(current => current.filter(item => item.id !== activeApproval.id));
      setNote('');
      window.dispatchEvent(new CustomEvent('svbk:approval-updated', { detail: data }));
    } catch (error) {
      window.alert(error.message);
    } finally {
      setBusy(false);
    }
  };

  if (!activeApproval) return null;

  return (
    <div className="approval-alert-backdrop" role="presentation">
      <section className="approval-alert-card" role="alertdialog" aria-modal="true" aria-labelledby="approval-alert-title">
        <div className="approval-alert-ring" aria-hidden="true"><i className="fa-solid fa-bell" /></div>
        <div className="approval-alert-copy">
          <span>Approval Required</span>
          <h2 id="approval-alert-title">{activeApproval.title}</h2>
          <p>{activeApproval.message}</p>
        </div>
        <textarea
          value={note}
          onChange={event => setNote(event.target.value)}
          placeholder="Decision note (optional)"
          rows="2"
        />
        <div className="approval-alert-actions">
          <button type="button" className="reject" disabled={busy} onClick={() => decide('REJECT')}>Reject</button>
          <button type="button" className="approve" disabled={busy} onClick={() => decide('APPROVE')}>{busy ? 'Saving...' : 'Approve & Allow'}</button>
        </div>
        {approvals.length > 1 && <small>{approvals.length - 1} more approval request(s)</small>}
      </section>
    </div>
  );
}
