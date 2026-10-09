import { useState, useEffect } from 'react'
import socket from '../socket/socket';
import { Badge, Card, IconButton, Input } from '../ui';

// Feedback shown under the guess box: correct (+points), close, or wrong.
const TONES = { correct: "green", close: "amber", wrong: "red" };

const GuessWord = ({ roomCode }) => {

  const [guess, setGuess] = useState("");
  const [feedback, setFeedback] = useState(null); // { kind: 'correct'|'close'|'wrong', text }

  useEffect(() => {
    // guess_result is broadcast for correct guesses; wrong results are sent only to the guesser.
    const handleGuessResult = (data) => {
      if (data.playerId !== socket.id) return;
      setFeedback(data.correct
        ? { kind: "correct", text: `✓ You got it! +${data.points} points` }
        : { kind: "wrong", text: `✗ ${data.guess}` });
    };

    const handleCloseGuess = ({ guess }) => {
      setFeedback({ kind: "close", text: `“${guess}” is close!` });
    };

    const clear = () => setFeedback(null);

    socket.on("guess_result", handleGuessResult);
    socket.on("close_guess", handleCloseGuess);
    socket.on("word_selected", clear);
    socket.on("new_round", clear);

    return () => {
      socket.off("guess_result", handleGuessResult);
      socket.off("close_guess", handleCloseGuess);
      socket.off("word_selected", clear);
      socket.off("new_round", clear);
    };
  }, []);

  const submitGuess = () => {
    if (!guess.trim()) return;
    socket.emit("guess", { roomCode, guess });
    setGuess("");
  };

  return (
    <Card className='flex w-full flex-col items-center gap-2 p-3'>
      <div className='flex w-full max-w-md items-center gap-2'>
        <Input type="text" value={guess} aria-label="Your guess" autoComplete="off" maxLength={150}
          onChange={(event) => setGuess(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              submitGuess()
            }
          }}
          placeholder='Type your guess and press Enter' />
        <IconButton label="Send guess" icon="send" tooltip={false} onClick={submitGuess}
          className='size-12 bg-blue-600 text-white hover:bg-blue-500' />
      </div>
      <p aria-live="polite" className='min-h-6'>
        {feedback && (
          <Badge key={feedback.text} tone={TONES[feedback.kind]} caps={false} className='animate-pop-in h-7 px-3 text-xs'>
            {feedback.text}
          </Badge>
        )}
      </p>
    </Card>
  )
}

export default GuessWord;
