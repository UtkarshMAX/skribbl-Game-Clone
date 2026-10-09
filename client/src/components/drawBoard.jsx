import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom';
import socket from '../socket/socket.js';
import WordBox from '../components/wordbox';
import Tools from './tools.jsx';
import GuessWord from './guessWord.jsx';
import ChooseWord from './chooseWord.jsx';
import { Avatar, Card, Modal, PlayerCard, PrimaryButton, Score, SecondaryButton, displayName } from '../ui';
import ReplayModal from './ReplayModal.jsx';


// isSpectator: watch only (no guess box). hostId: the host gets "Play again" on the results screen.
const DrawBoard = ({ isSpectator = false, hostId = "" }) => {
    const canvasRef = useRef(null);
    const lastPointRef = useRef(null);
    const strokesRef = useRef([]);
    const timeoutRef = useRef(null);

    const { roomCode } = useParams();
    const navigate = useNavigate();
    const [isDrawing, setIsDrawing] = useState(false);
    const [color, setColor] = useState("black");
    const [tool, setTool] = useState("brush");

    const [brushSize, setBrushSize] = useState(5);
    const [currentDrawerId, setCurrentDrawerId] = useState(null);

    const [showWordDialog, setShowWordDialog] = useState(false);
    const [wordOptions, setWordOptions] = useState([]);
    const [wordTimeLeft, setWordTimeLeft] = useState(20);
    const [choosing, setChoosing] = useState(null); // { timeLeft, drawerId, drawerName } while a word is being picked

    const [showRoundEnd, setshowRoundEnd] = useState(false);
    const [revealedWord, setRevealedWord] = useState("");
    const [roundScores, setRoundScores] = useState([]);       // [{ playerId, name, avatar, score, earned }]
    const [nextDrawerName, setNextDrawerName] = useState("");
    const [lastTurnStrokes, setLastTurnStrokes] = useState([]); // timestamped strokes from round_end (replay)
    const [showReplay, setShowReplay] = useState(false);

    const [maxRounds, setMaxRounds] = useState(0)
    const [round, setRound] = useState(0);
    const [time, setTime] = useState(0);
    const [word, setWord] = useState("");

    const [gameOver, setGameOver] = useState(false);
    const [leaderboard, setLeaderboard] = useState([]);
    const [winner, setWinner] = useState(null);

    const getCursor = () => {
        if (socket.id !== currentDrawerId) return 'default';
        if (tool === 'eraser') {
            return `url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24'><circle cx='12' cy='12' r='10' fill='%23ccc' fill-opacity='0.3' stroke='%23999' stroke-width='1.5'/><circle cx='12' cy='12' r='4' fill='%23999' stroke='%23777' stroke-width='1'/></svg>") 12 12, auto`;
        }
        return `url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24'><circle cx='12' cy='12' r='10' fill='%234a86c8' fill-opacity='0.25' stroke='%234a86c8' stroke-width='1'/><circle cx='12' cy='12' r='4' fill='%233b6fa0' stroke='%23345e88' stroke-width='1.5'/></svg>") 12 12, crosshair`;
    };

    const redrawCanvas = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        for (const stroke of strokesRef.current) {
            if (!stroke.points.length) continue;

            ctx.beginPath();
            ctx.strokeStyle = stroke.color;
            ctx.lineWidth = stroke.size;
            ctx.lineCap = "round";
            ctx.moveTo(
                stroke.points[0].x,
                stroke.points[0].y
            );

            for (let i = 1; i < stroke.points.length; i++) {
                ctx.lineTo(
                    stroke.points[i].x,
                    stroke.points[i].y
                );
            }
            ctx.stroke();
        }
    }

    useEffect(() => {
        const handleDrawStart = (stroke) => {
            strokesRef.current.push(stroke);
            redrawCanvas();
        };
        const handleDrawMove = ({ strokeId, x, y }) => {
            const stroke = strokesRef.current.find(s => s.id === strokeId);
            if (!stroke) return;
            stroke.points.push({ x, y });
            redrawCanvas();
        };
        const handleDrawUndo = (strokes) => {
            strokesRef.current = strokes;
            redrawCanvas();
        };
        const handleCanvasClear = () => {
            strokesRef.current = [];
            redrawCanvas();
        };
        const handleCanvasState = (strokes) => {
            strokesRef.current = strokes;
            redrawCanvas();
        };
        const handleGameState = (data) => {
            setRound(data.currentRound);
            setTime(data.timeLeft);
            setWord(data.word);
            setMaxRounds(data.maxRounds);
            setCurrentDrawerId(data.drawerId);
        };
        const handleWordSelected = () => {
            setShowWordDialog(false);
            setChoosing(null);
        };
        const handleHintReveal = ({ displayWord }) => {
            setWord(displayWord);
        };
        const handleRoundEnd = ({ word, scores = [], nextDrawerId = null, strokes = [] }) => {
            setLastTurnStrokes(strokes);
            clearTimeout(timeoutRef.current);
            setshowRoundEnd(true);
            setRevealedWord(word);
            setRoundScores(scores);
            setNextDrawerName(scores.find((s) => s.playerId === nextDrawerId)?.name || "");
            timeoutRef.current = setTimeout(() => {
                setshowRoundEnd(false);
            }, 5000);
        };
        const handleNewRound = () => {
            setRevealedWord("");
            setChoosing(null);
        };
        const handleChooseWord = ({ words, timeLeft }) => {
            setWordOptions(words || []);
            setWordTimeLeft(timeLeft ?? 20);
            setShowWordDialog(true);
        };
        const handleWordSelectionTick = ({ timeLeft, drawerId, drawerName }) => {
            setWordTimeLeft(timeLeft);
            setChoosing({ timeLeft, drawerId, drawerName });
        };
        // Full picture when arriving mid-game (spectators) or when this screen opens.
        const handleSnapshot = ({ gameState, strokes = [], wordSelection = null } = {}) => {
            if (gameState) handleGameState(gameState);
            strokesRef.current = strokes;
            redrawCanvas();
            setChoosing(wordSelection);
        };
        const handleGameOver = ({ winner, leaderboard }) => {
            setGameOver(true);
            setChoosing(null);
            setWinner(winner);
            setLeaderboard(leaderboard || []);
            setShowWordDialog(false);
            setshowRoundEnd(false);
        };

        socket.on("draw_start", handleDrawStart);
        socket.on("draw_move", handleDrawMove);
        socket.on("draw_undo", handleDrawUndo);

        socket.on("canvas_clear", handleCanvasClear);
        socket.on("canvas_state", handleCanvasState);
        socket.on("game_state", handleGameState);

        socket.on("word_selected", handleWordSelected);
        socket.on("hint_reveal", handleHintReveal);
        socket.on("round_end", handleRoundEnd);

        socket.on("new_round", handleNewRound);
        socket.on("word_options", handleChooseWord);
        socket.on("word_selection_tick", handleWordSelectionTick);
        socket.on("game_over", handleGameOver);
        socket.on("game_snapshot", handleSnapshot);

        return () => {
            clearTimeout(timeoutRef.current);
            socket.off("draw_start", handleDrawStart);
            socket.off("draw_move", handleDrawMove);
            socket.off("draw_undo", handleDrawUndo);

            socket.off("canvas_clear", handleCanvasClear);
            socket.off("canvas_state", handleCanvasState);
            socket.off("game_state", handleGameState);

            socket.off("word_selected", handleWordSelected);
            socket.off("hint_reveal", handleHintReveal);
            socket.off("round_end", handleRoundEnd);

            socket.off("new_round", handleNewRound);
            socket.off("word_options", handleChooseWord);
            socket.off("word_selection_tick", handleWordSelectionTick);
            socket.off("game_over", handleGameOver);
            socket.off("game_snapshot", handleSnapshot);
        };

    }, []);


    const startDrawing = (event) => {
        if (socket.id !== currentDrawerId) return;
        setIsDrawing(true);
        
        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();
        const x = ((event.clientX - rect.left) / rect.width) * canvas.width;
        const y = ((event.clientY - rect.top) / rect.height) * canvas.height;

        lastPointRef.current = { x, y };
        socket.emit("draw_start", {
            roomCode,
            x, y,
            color: tool === "eraser" ? "white" : color,
            size: brushSize
        });
    };

    const stopDrawing = () => {
        if (!isDrawing) return;

        socket.emit("draw_end");
        setIsDrawing(false);
        lastPointRef.current = null;
    };



    const draw = (event) => {
        if (!isDrawing) return;

        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();
        const x = (event.nativeEvent.offsetX / rect.width) * canvas.width;
        const y = (event.nativeEvent.offsetY / rect.height) * canvas.height;

        socket.emit("draw_move", {
            roomCode,
            x, y
        });
    };

    // Redraw when the canvas comes back after a full-screen overlay (round end / results).
    useEffect(() => {
        if (!showRoundEnd && !gameOver) redrawCanvas();
    }, [showRoundEnd, gameOver]);

    const isHost = socket.id === hostId;

    // "Back to home" really leaves the room on the server (no ghost player left behind).
    const leaveToHome = () => {
        socket.emit("leave_room", { roomCode });
        navigate('/');
    };

    // 4.6: the replay sits on top of whatever is showing and stays open until closed.
    const replay = showReplay && (
        <ReplayModal strokes={lastTurnStrokes} onClose={() => setShowReplay(false)} />
    );
    const replayButton = lastTurnStrokes.length > 0 && (
        <SecondaryButton size="sm" onClick={() => setShowReplay(true)}>▶ Replay last turn</SecondaryButton>
    );

    if (gameOver) {
        return (
            <>
            <Modal size="md" className='cursor-default'>
                <div className='flex flex-col items-center text-center'>
                    <span className='text-5xl' aria-hidden="true">🏆</span>
                    <h2 className='mt-1 text-3xl font-black'>Game over!</h2>
                </div>

                {winner && (
                    <div className='mt-5 flex flex-col items-center gap-1.5 rounded-card bg-amber-50 p-5 text-center'>
                        <Avatar emoji={winner.avatar || '😀'} size="lg" highlight />
                        <p className='mt-1 text-xs font-black uppercase tracking-wider text-amber-700'>Winner</p>
                        <p className='text-2xl font-black'>{displayName(winner.name)}</p>
                        <Score value={winner.score} className='text-lg' />
                    </div>
                )}

                <h3 className='mt-6 mb-2 text-sm font-black uppercase tracking-wider text-slate-500'>Leaderboard</h3>
                <div className='flex max-h-[40vh] flex-col gap-2 overflow-y-auto'>
                    {leaderboard.map((player, i) => (
                        <PlayerCard key={player.id} player={player} rank={i + 1} isYou={player.id === socket.id} />
                    ))}
                </div>

                {replayButton && <div className='mt-4 flex justify-center'>{replayButton}</div>}

                {/* 4.8: the host can take everyone back to the lobby; others go home. */}
                {isHost ? (
                    <div className='mt-6 flex flex-col gap-3'>
                        <PrimaryButton size="lg" className='w-full' onClick={() => socket.emit("play_again", { roomCode })}>
                            Play again
                        </PrimaryButton>
                        <SecondaryButton size="lg" className='w-full' onClick={leaveToHome}>
                            Back to home
                        </SecondaryButton>
                    </div>
                ) : (
                    <>
                        <PrimaryButton size="lg" className='mt-6 w-full' onClick={leaveToHome}>
                            Back to home
                        </PrimaryButton>
                        <p className='mt-2 text-center text-xs font-bold text-slate-400'>Stay here if the host starts a new game</p>
                    </>
                )}
            </Modal>
            {replay}
            </>
        )
    }

    if (showRoundEnd) {
        return (
            <>
            <Modal size="sm" className='cursor-default text-center'>
                <p className="text-sm font-black uppercase tracking-wider text-slate-500">
                    The word was
                </p>
                <p className='animate-pop-in mt-2 break-words text-4xl font-black text-ink'>
                    {revealedWord.replace(/\+/g, ' ').replace(/\s+/g, ' ')}
                </p>

                {/* Points each player earned this turn (from round_end.scores) */}
                {roundScores.length > 0 && (
                    <ul className='mt-5 flex max-h-[40vh] flex-col gap-1.5 overflow-y-auto text-left' aria-label="Points this turn">
                        {roundScores.map((s) => (
                            <li key={s.playerId} className='flex items-center gap-3 rounded-control bg-slate-50 px-3 py-2'>
                                <span aria-hidden="true" className='text-xl'>{s.avatar || '😀'}</span>
                                <span className='min-w-0 flex-1 truncate font-extrabold text-ink'>
                                    {displayName(s.name)}{s.playerId === socket.id && <span className='ml-1 text-xs font-bold text-slate-400'>(you)</span>}
                                </span>
                                <span className={`font-black tabular-nums ${s.earned > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
                                    {s.earned > 0 ? `+${s.earned}` : '0'}
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
                {nextDrawerName && (
                    <p className='mt-4 text-sm font-bold text-slate-500'>
                        Next up: <span className='text-ink'>{displayName(nextDrawerName)}</span> 🎨
                    </p>
                )}
                {replayButton && <div className='mt-4 flex justify-center'>{replayButton}</div>}
            </Modal>
            {replay}
            </>
        )
    }

    return (
        <div className='flex w-full flex-col items-center gap-3'>

            <WordBox round={round} time={time} maxRounds={maxRounds} word={word} drawerId={currentDrawerId} choosing={choosing} />

            <canvas ref={canvasRef} width={800} height={600} onPointerDown={startDrawing} onPointerUp={stopDrawing}
                onPointerMove={draw} onPointerLeave={stopDrawing}
                style={{ cursor: getCursor() }}
                aria-label="Drawing canvas"
                className='block w-full aspect-[4/3] bg-white rounded-card shadow-card ring-1 ring-slate-200/70 touch-none' />

            {
                showWordDialog && (
                    <ChooseWord
                        words={wordOptions}
                        timeLeft={wordTimeLeft}
                        roomCode={roomCode}
                        setOpen={setShowWordDialog}
                    />
                )
            }


            {
                socket.id === currentDrawerId &&
                (
                    <Tools color={color} setColor={setColor} brushSize={brushSize}
                        setBrushSize={setBrushSize} tool={tool} setTool={setTool} roomCode={roomCode} />
                )
            }
            {
                socket.id !== currentDrawerId && !isSpectator &&
                (
                    <GuessWord roomCode={roomCode} />
                )
            }
            {
                isSpectator && (
                    <Card className='w-full p-4 text-center' role="status">
                        <p className='text-xs font-black uppercase tracking-wider text-blue-700'>👁 Spectator</p>
                        <p className='mt-1 font-extrabold text-ink'>You&apos;re watching this round.</p>
                        <p className='mt-1 text-sm font-semibold text-slate-500'>
                            You can chat, but not draw or guess. You&apos;ll join as a player if the host starts a new game and there&apos;s space.
                        </p>
                    </Card>
                )
            }
            {replayButton && <div className='self-end'>{replayButton}</div>}
            {replay}
        </div>
    )
}

export default DrawBoard;