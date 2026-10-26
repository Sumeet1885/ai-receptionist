import { useEffect, useRef } from 'react';
import { useLanding } from './LandingContext';

/** Canvas colours are component-specific tints of the brand palette (canvas cannot read CSS variables per frame). */
const ORBIT = ['#b2c69c88', '#c5d3b077'];
const DOT_GREEN = '#6a967a';
const SPHERE = ['#eff6c4', '#c6e298', '#73a271', '#285e48'];

/** Reads the theme's accent orange once (canvas needs a concrete colour). */
function readAccentOrange() {
  const value = getComputedStyle(document.documentElement).getPropertyValue('--color-accent-orange').trim();
  const hex = /^#[0-9a-f]{6}$/i.test(value) ? value : '#ed754a';
  const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(',');
  return { hex, rgb };
}

/** The animated voice sphere behind the hero conversation. Pointer moves it; tapping sends a ripple. */
export function HeroCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { motionPaused, heroEnergy } = useLanding();
  const motionPausedRef = useRef(motionPaused);
  motionPausedRef.current = motionPaused;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const orange = readAccentOrange();
    let w = 0;
    let h = 0;
    let frame = 0;
    let raf = 0;
    let visible = true;
    let pointer = { x: 0, y: 0 };
    const ripples: { x: number; y: number; radius: number; alpha: number }[] = [];

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = rect.width;
      h = rect.height;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = () => {
      raf = requestAnimationFrame(draw);
      frame++;
      const paused = motionPausedRef.current;
      if (!visible || document.hidden || (paused && frame % 20 !== 0) || !w) return;

      const energy = heroEnergy.current;
      const t = paused ? 0 : performance.now() / 1000;
      ctx.clearRect(0, 0, w, h);
      const mobile = w < 800;
      const cx = w * 0.5 + pointer.x * 16;
      const cy = h * 0.49 + pointer.y * 10;
      const r = Math.min(w * (mobile ? 0.24 : 0.15), h * 0.36);

      ctx.save();
      ctx.translate(cx, cy);
      for (let orbit = 0; orbit < 3; orbit++) {
        const rx = r * (1.55 + orbit * 0.52);
        const ry = r * (0.49 + orbit * 0.2);
        ctx.save();
        ctx.rotate(-0.3 + orbit * 0.24);
        ctx.strokeStyle = orbit === 0 ? ORBIT[0] : ORBIT[1];
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
        ctx.stroke();
        for (let n = 0; n < 2; n++) {
          const a = t * (0.22 + orbit * 0.09) + n * Math.PI + orbit;
          ctx.fillStyle = n ? orange.hex : DOT_GREEN;
          ctx.beginPath();
          ctx.arc(Math.cos(a) * rx, Math.sin(a) * ry, orbit === 1 ? 4 : 3, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      ctx.save();
      ctx.translate(0, r * 1.3);
      ctx.scale(1, 0.16);
      const shadow = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
      shadow.addColorStop(0, '#40684033');
      shadow.addColorStop(1, '#40684000');
      ctx.fillStyle = shadow;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      const breathe = paused ? 0 : Math.sin(t * 1.5) * 3;
      const g = ctx.createRadialGradient(-r * 0.35, -r * 0.45, r * 0.01, 0, 0, r * 1.15);
      g.addColorStop(0, SPHERE[0]);
      g.addColorStop(0.33, SPHERE[1]);
      g.addColorStop(0.7, SPHERE[2]);
      g.addColorStop(1, SPHERE[3]);
      ctx.fillStyle = g;
      ctx.beginPath();
      for (let n = 0; n <= 180; n++) {
        const a = (n / 180) * Math.PI * 2;
        const rr = r + breathe + (paused ? 0 : Math.sin(a * 3 + t) * 3 + Math.cos(a * 5 - t * 0.7) * 2);
        const x = Math.cos(a) * rr;
        const y = Math.sin(a) * rr;
        if (n) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      }
      ctx.closePath();
      ctx.fill();

      ctx.save();
      ctx.rotate(-0.15);
      ctx.strokeStyle = '#ffffff33';
      ctx.beginPath();
      ctx.ellipse(-r * 0.1, -r * 0.18, r * 0.82, r * 0.56, 0, Math.PI, Math.PI * 1.9);
      ctx.stroke();
      ctx.restore();

      for (let n = 0; n < 17; n++) {
        const level = Math.max(0, 1 - Math.abs(n - 8) / 10);
        const v = energy.speaking
          ? Math.min(1, energy.energy * 2.2 * (0.65 + 0.35 * Math.sin(n * 0.8) ** 2))
          : paused
            ? 0.45
            : 0.3 + 0.7 * Math.abs(Math.sin(t * 3 + n * 0.52));
        const bh = 5 + r * 0.55 * v * level + (energy.burst > 0 ? energy.burst * level : 0);
        ctx.fillStyle = '#faffed';
        ctx.beginPath();
        ctx.roundRect((n - 8) * r * 0.072 - r * 0.015, -bh / 2, r * 0.03, bh, r * 0.015);
        ctx.fill();
      }
      ctx.restore();

      for (let i = ripples.length - 1; i >= 0; i--) {
        const p = ripples[i];
        p.radius += 3;
        p.alpha -= 0.014;
        ctx.strokeStyle = `rgba(${orange.rgb},${Math.max(0, p.alpha)})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.stroke();
        if (p.alpha <= 0) ripples.splice(i, 1);
      }
      energy.burst *= 0.94;
    };

    const onPointerMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointer = { x: (e.clientX - rect.left) / w - 0.5, y: (e.clientY - rect.top) / h - 0.5 };
    };
    const onPointerLeave = () => {
      pointer = { x: 0, y: 0 };
    };
    const onPointerDown = (e: PointerEvent) => {
      if (motionPausedRef.current) return;
      const rect = canvas.getBoundingClientRect();
      ripples.push({ x: e.clientX - rect.left, y: e.clientY - rect.top, radius: 5, alpha: 0.7 });
      heroEnergy.current.burst = 35;
    };

    resize();
    window.addEventListener('resize', resize);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerleave', onPointerLeave);
    canvas.addEventListener('pointerdown', onPointerDown);
    const observer = new IntersectionObserver((entries) => {
      visible = entries[0]?.isIntersecting ?? true;
    });
    observer.observe(canvas);
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      canvas.removeEventListener('pointerdown', onPointerDown);
    };
  }, [heroEnergy]);

  return (
    <canvas
      ref={canvasRef}
      id="voice-canvas"
      className="hero-canvas"
      aria-label="Interactive animated voice sphere. Move your pointer or tap to send a ripple."
    />
  );
}
