import { useEffect, useRef, useState } from "react";
import socket from "../socket/socket";
import { GamePanel, Input } from "../ui";

const ChatBox = ({ roomCode }) => {

  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([]);

  const bottomRef = useRef(null);

  useEffect(() => {
    const handleChatMessage = (msg) => {
      setMessages(prev => [...prev, msg]);
    };

    // "You're close" hints are private, so they're added locally (also covers guesses typed here).
    const handleCloseGuess = ({ guess }) => {
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        type: "system",
        tone: "warning",
        text: `“${guess}” is close!`
      }]);
    };

    // Arriving mid-game (e.g. a spectator): start from the recent public chat in the snapshot.
    const handleSnapshot = ({ chat = [] } = {}) => {
      setMessages(prev => (prev.length ? prev : chat));
    };

    // "X guessed the word!" now arrives from the server as a system chat_message.
    socket.on("chat_message", handleChatMessage);
    socket.on("close_guess", handleCloseGuess);
    socket.on("game_snapshot", handleSnapshot);

    return () => {
      socket.off("chat_message", handleChatMessage);
      socket.off("close_guess", handleCloseGuess);
      socket.off("game_snapshot", handleSnapshot);
    };

  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: "smooth"
    });
  }, [messages]);

  const sendMessage = () => {
    if (!message.trim()) return;

    socket.emit("chat", {
      roomCode,
      text: message
    });

    setMessage("");
  };

  return (

    <GamePanel title="Chat" className="h-full w-full" bodyClassName="flex flex-col">

      {/* ------- Messages --------- */}

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2" aria-live="polite">

        {
          messages.length === 0 && (
            <div className="h-full flex justify-center items-center text-sm font-bold text-slate-400">
              No messages yet — say hi!
            </div>
          )
        }

        {
          messages.map((msg) => {
            if (msg.type === "system") {
              const tone = msg.tone === "success" ? "bg-emerald-50 text-emerald-700"
                : msg.tone === "warning" ? "bg-amber-50 text-amber-700"
                  : "bg-slate-100 text-slate-500";
              return (
                <div key={msg.id}
                  className={`animate-slide-in rounded-badge px-3 py-1.5 text-center text-xs font-extrabold ${tone}`}>
                  {msg.text}
                </div>
              );
            }

            // "guessed": only the drawer and correct guessers receive these (word-leak protection).
            const isGuessed = msg.type === "guessed";
            return (
              <div key={msg.id}
                className={`animate-slide-in rounded-control px-3 py-2 break-all ${isGuessed ? "bg-emerald-50 ring-1 ring-emerald-200" : "bg-slate-50"}`}>

                <p className={`flex items-center gap-1.5 text-xs font-black ${isGuessed ? "text-emerald-700" : "text-blue-700"}`}>
                  {msg.spectator && <span aria-label="Spectator" title="Spectator">👁</span>}
                  {msg.playerName}
                  {isGuessed && <span className="rounded-badge bg-emerald-100 px-1.5 text-[10px] uppercase tracking-wide">guessed</span>}
                  {msg.private && <span className="rounded-badge bg-slate-200 px-1.5 text-[10px] font-bold text-slate-500">only you</span>}
                </p>

                <p className="text-sm font-semibold text-ink whitespace-pre-wrap break-all">
                  {msg.text}
                </p>
              </div>
            );
          })
        }

        <div ref={bottomRef}></div>

      </div>

      <div className="border-t border-slate-100 p-3">
        <Input value={message} maxLength={150} aria-label="Chat message" autoComplete="off"
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              sendMessage();
            }
          }}
          placeholder="Type & press Enter"
          className="h-11 text-sm" />
      </div>

    </GamePanel>
  );
};

export default ChatBox;