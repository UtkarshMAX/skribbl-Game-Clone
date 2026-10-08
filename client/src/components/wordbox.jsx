import React, { useEffect, useState } from 'react';
import socket from '../socket/socket';
import { Card, Timer, displayName } from '../ui';


const WordBox = (props) => {

    const [word, setWord] = useState("");

    useEffect(() => {
        const handleDrawerWord = ({ word }) => {
            setWord(word);
        };

        // A new turn starts with nobody (except the next drawer) knowing the word.
        const handleNewRound = () => setWord("");

        socket.on("drawer_word", handleDrawerWord);
        socket.on("new_round", handleNewRound);
        return () => {
            socket.off("drawer_word", handleDrawerWord);
            socket.off("new_round", handleNewRound);
        };
    }, [])

    useEffect(() => {
        if (socket.id !== props.drawerId) {
            setWord("");
        }
    }, [props.drawerId]);

    const isDrawer = socket.id === props.drawerId;
    const choosing = props.choosing;
    // The real word is sent only to the drawer and to players who already guessed it.
    const knowsWord = isDrawer || !!word;
    const shown = (knowsWord ? word : props.word) || "";

    return (

        <Card className='flex w-full items-center justify-between gap-3 px-3 py-2.5 sm:px-4'>

            <div className='flex shrink-0 flex-col items-center leading-none' aria-label={`Round ${props.round} of ${props.maxRounds}`}>
                <span className='text-[10px] font-black uppercase tracking-wider text-slate-400'>Round</span>
                <span className='mt-1 text-xl font-black tabular-nums text-ink'>{props.round}<span className='text-slate-400'>/{props.maxRounds}</span></span>
            </div>

            {/* ----------WORD------------ */}

            {choosing ? (
            <div className="flex min-w-0 flex-col items-center text-center" role="status">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Get ready</span>
                <span className="mt-1 truncate text-base font-extrabold text-ink sm:text-lg">
                    <span aria-hidden="true">🎨 </span>
                    {choosing.drawerId === socket.id ? "You are" : `${displayName(choosing.drawerName)} is`} choosing a word…
                </span>
            </div>
            ) : (
            <div className="flex min-w-0 flex-col items-center">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                    {shown ? (isDrawer ? "Draw this" : knowsWord ? "You got it!" : "Guess the word") : "Waiting for word"}
                </span>

                <div className="mt-1 flex min-h-8 flex-wrap justify-center gap-x-1 gap-y-1" aria-label={knowsWord ? shown : `${shown.replace(/[^_]/g, "").length} hidden letters`}>
                    {shown.split("").map((char, index) => {
                        if (char === " ") return <span key={index} className="w-3" />;
                        if (char === "+") return <span key={index} className="px-1 text-xl font-black text-amber-500">+</span>;
                        if (char === "-") return <span key={index} className="self-end pb-1 text-xl font-black text-ink">-</span>;
                        return (
                            <span key={index}
                                className="grid h-8 w-5 place-items-end justify-center border-b-[3px] border-ink/70 pb-0.5 text-lg font-black uppercase leading-none text-ink sm:w-6 sm:text-xl">
                                {char === "_" ? "" : char}
                            </span>
                        );
                    })}
                </div>
            </div>
            )}

            {/* Separate keys so each countdown keeps its own full length (20s vs draw time). */}
            {choosing
                ? <Timer key="choosing" time={choosing.timeLeft} />
                : <Timer key="drawing" time={Number(props.time) || 0} />}

        </Card>
    )
}

export default WordBox;
