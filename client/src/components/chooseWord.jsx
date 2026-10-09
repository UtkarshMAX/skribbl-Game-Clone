import { useRef, useState } from "react";
import socket from "../socket/socket";
import { Modal, SecondaryButton, Timer } from "../ui";

// The server owns the 20s countdown and auto-picks a random word at 0;
// timeLeft here only mirrors its word_selection_tick events.
const ChooseWord = ({ words = [], timeLeft = 20, roomCode, setOpen }) => {

    const sentRef = useRef(false);
    const [picked, setPicked] = useState(null);

    const selectWord = (word) => {
    if (sentRef.current) return; // one selection per dialog, however fast the clicks
    sentRef.current = true;
    setPicked(word);
    socket.emit("word_chosen", { roomCode, word });
    setOpen(false);
    };

    return (
        <Modal title="Your turn to draw!" description="Pick a word — the others will try to guess it.">
            <div className="mb-4 flex items-center gap-3 rounded-control bg-slate-50 p-3">
                <Timer time={timeLeft} />
                <p className="text-sm font-bold text-slate-500">
                    {timeLeft > 0
                        ? <>A random word is picked for you in <span className="text-ink">{timeLeft}s</span>.</>
                        : "Picking a random word…"}
                </p>
            </div>

            <div className="flex flex-col gap-3">
                {words.map((word, index) => (
                    <SecondaryButton
                        key={`${word}-${index}`}
                        autoFocus={index === 0}
                        size="lg"
                        className="w-full"
                        disabled={picked !== null || timeLeft <= 0}
                        onClick={() => selectWord(word)}
                    >
                        {word}
                    </SecondaryButton>
                ))}
            </div>
        </Modal>
    );
};

export default ChooseWord;
