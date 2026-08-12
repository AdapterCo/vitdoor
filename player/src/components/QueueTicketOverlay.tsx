import React, { useEffect, useState } from 'react';
import { Volume2 } from 'lucide-react';

interface TicketData {
  ticketNumber: string;
  deskName: string;
  audioText: string;
  calledAt: string;
}

export function QueueTicketOverlay({ ticket }: { ticket: TicketData | null }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!ticket) {
      setVisible(false);
      return;
    }

    setVisible(true);

    // 1. Play Chime Sound (synthesized ding-dong using Web Audio API)
    playChimeSound();

    // 2. Synthesize Speech (TTS) using Web Speech API
    if ('speechSynthesis' in window && ticket.audioText) {
      // Cancel previous speech if speaking
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(ticket.audioText);
      utterance.lang = 'pt-BR';
      utterance.rate = 0.9; // Slightly slower for clear TV announcement
      utterance.pitch = 1.0;

      // Small delay so chime sound finishes before speech starts
      const timer = setTimeout(() => {
        window.speechSynthesis.speak(utterance);
      }, 700);

      return () => clearTimeout(timer);
    }

    // Auto hide after 12 seconds
    const timer = setTimeout(() => {
      setVisible(false);
    }, 12000);

    return () => clearTimeout(timer);
  }, [ticket]);

  if (!visible || !ticket) return null;

  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      zIndex: 9000,
      background: 'rgba(9, 13, 22, 0.92)',
      backdropFilter: 'blur(16px)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px',
      textAlign: 'center',
      animation: 'ticketPulse 0.4s ease-out'
    }}>
      <style>{`
        @keyframes ticketPulse {
          0% { transform: scale(0.85); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>

      {/* Audio Icon Badge */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        background: 'rgba(37, 99, 235, 0.2)',
        border: '2px solid #3b82f6',
        padding: '12px 32px',
        borderRadius: '50px',
        color: '#60a5fa',
        fontWeight: 800,
        fontSize: '1.4rem',
        marginBottom: '30px',
        boxShadow: '0 0 30px rgba(59, 130, 246, 0.4)'
      }}>
        <Volume2 size={32} /> SENHA CHAMADA
      </div>

      {/* Ticket Number Card */}
      <div style={{
        background: 'radial-gradient(circle at center, #1e293b 0%, #0f172a 100%)',
        border: '3px solid #38bdf8',
        borderRadius: '36px',
        padding: '40px 90px',
        boxShadow: '0 30px 60px rgba(0, 0, 0, 0.8), 0 0 50px rgba(56, 189, 248, 0.3)'
      }}>
        <div style={{
          fontSize: '9rem',
          fontWeight: 900,
          color: '#ffffff',
          letterSpacing: '6px',
          lineHeight: 1,
          textShadow: '0 0 40px rgba(255,255,255,0.6)',
          fontFamily: 'monospace, monospace'
        }}>
          {ticket.ticketNumber}
        </div>

        <div style={{
          fontSize: '2.8rem',
          fontWeight: 800,
          color: '#38bdf8',
          marginTop: '20px',
          letterSpacing: '1px'
        }}>
          {ticket.deskName}
        </div>
      </div>
    </div>
  );
}

/**
 * Synthesizes a clean two-tone chime sound (ding-dong) using Web Audio API
 */
function playChimeSound() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();

    // First tone (E5 - 659.25 Hz)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(659.25, ctx.currentTime);
    gain1.gain.setValueAtTime(0.4, ctx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(ctx.currentTime);
    osc1.stop(ctx.currentTime + 0.6);

    // Second tone (C5 - 523.25 Hz) after 0.25s
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(523.25, ctx.currentTime + 0.25);
    gain2.gain.setValueAtTime(0.45, ctx.currentTime + 0.25);
    gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.0);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(ctx.currentTime + 0.25);
    osc2.stop(ctx.currentTime + 1.0);
  } catch (err) {
    console.warn('AudioContext chime failed:', err);
  }
}
