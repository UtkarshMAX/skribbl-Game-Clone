import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { Modal, PrimaryButton, SecondaryButton } from '../ui';

// Points recorded before timestamps existed get evenly spaced fake times.
const withTimes = (strokes) => strokes.map((stroke, si) => ({
    ...stroke,
    points: stroke.points.map((p, pi) => ({ ...p, t: typeof p.t === 'number' ? p.t : si * 1000 + pi * 16 })),
}));

function drawUntil(ctx, strokes, time) {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    for (const stroke of strokes) {
        const points = stroke.points.filter((p) => p.t <= time);
        if (!points.length) continue;
        ctx.beginPath();
        ctx.strokeStyle = stroke.color;
        ctx.lineWidth = stroke.size;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
        ctx.stroke();
    }
}

/**
 * 4.6 Replay: plays the last turn's strokes back on a canvas, client-side, using the
 * per-point timestamps (`t`, ms into the turn) the server sends with round_end.
 */
export default function ReplayModal({ strokes, onClose, speed = 2 }) {
    const canvasRef = useRef(null);
    const [run, setRun] = useState(0);
    const [progress, setProgress] = useState(0);

    useEffect(() => {
        const ctx = canvasRef.current?.getContext('2d');
        if (!ctx) return;
        const timed = withTimes(strokes);
        const times = timed.flatMap((s) => s.points.map((p) => p.t));
        if (!times.length) return;
        const start = Math.min(...times);
        const end = Math.max(...times);

        // Reduced motion: show the finished drawing straight away (on the first frame).
        const instant = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

        let frame;
        const began = performance.now();
        const tick = (now) => {
            const time = instant ? end : start + (now - began) * speed;
            drawUntil(ctx, timed, time);
            setProgress(Math.min(1, (time - start) / Math.max(end - start, 1)));
            if (time < end) frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frame);
    }, [strokes, speed, run]);

    const empty = !strokes.some((s) => s.points?.length);

    return (
        <Modal size="lg" title="Replay — last turn" description={`Played back at ${speed}× speed.`} onClose={onClose}>
            {empty ? (
                <p className="rounded-control bg-slate-50 p-6 text-center font-bold text-slate-500">Nothing was drawn this turn.</p>
            ) : (
                <>
                    <canvas ref={canvasRef} width={800} height={600} aria-label="Replay of the last drawing"
                        className="block w-full aspect-[4/3] rounded-card bg-white ring-1 ring-slate-200" />
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100" role="progressbar"
                        aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
                        <div className="h-full rounded-full bg-blue-500" style={{ width: `${progress * 100}%` }} />
                    </div>
                </>
            )}
            <div className="mt-5 flex flex-wrap justify-end gap-3">
                {!empty && <SecondaryButton onClick={() => { setProgress(0); setRun((r) => r + 1); }}>↺ Replay again</SecondaryButton>}
                <PrimaryButton autoFocus onClick={onClose}>Close</PrimaryButton>
            </div>
        </Modal>
    );
}

ReplayModal.propTypes = {
    strokes: PropTypes.array.isRequired,
    onClose: PropTypes.func.isRequired,
    speed: PropTypes.number,
};
