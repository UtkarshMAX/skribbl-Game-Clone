# 🎨 Scribble Clone

A real-time multiplayer drawing and guessing game built as part of a Full Stack Development assignment.

The application allows multiple players to join a room, take turns drawing a selected word, and compete by guessing the drawing before time runs out. The entire game state, drawing canvas, and player interactions are synchronized in real-time using WebSockets.

<<<<<<< HEAD
| | URL |
|---|---|
| Game (Render) | `https://scribble-client-x4zy.onrender.com/` ·Backend health check: `https://scribble-game-3aex.onrender.com/health` |
=======
---

## Assignment Objective

Build an end-to-end clone of Scribbl.io featuring:

- Multiplayer room management
- Turn-based drawing gameplay
- Real-time canvas synchronization
- Word selection and guessing
- Score tracking and leaderboard
- Complete game lifecycle management

---

## Demo

https://scribble-client-x4zy.onrender.com/

Backend health check: https://scribble-game-3aex.onrender.com/health
>>>>>>> f0ffbf7 (Update After QA testing)

> The server runs on Render's free plan, so the first visit after a quiet period can take up to ~50 seconds
> while it wakes up. The game shows "Connecting to server…" until then.

GIVE THIS GAME A CHANCE!

---

## Implemented Features

### Room & Lobby System
- Room creation using unique room codes
- Room joining functionality
- Host-controlled game start
- Live player list updates
- Player disconnect handling

### Real-Time Drawing
- Shared multiplayer canvas
- Stroke-based synchronization
- Brush color selection
- Brush size adjustment
- Undo functionality
- Canvas clearing

### Game Management
- Round management
- Turn rotation between players
- Countdown timer
- Automatic round progression
- Game completion handling

### Word System
- Random word generation
- Multiple word choices for drawer
- Hidden word display for guessers
- Word reveal after round completion

### Guessing System
- Real-time guess submission
- Correct answer validation
- Player notifications
- Guess-based scoring

### Scoring & Leaderboard
- Dynamic score updates
- Round-by-round score tracking
- Final winner determination

---

## Technology Stack

### Frontend
- React
- React Router
- Tailwind CSS
- Socket.IO Client

### Backend
- Node.js
- Express.js
- Socket.IO

### Communication
- WebSockets (Socket.IO)

---
## 📂 Project Structure

```text
scribble-clone/
│
├── client/
│   ├── public/
│   │
│   ├── src/
│   │   ├── assets/
│   │   │   └── bg.svg
│   │   │
│   │   ├── components/
│   │   │   ├── ChatBox.jsx
│   │   │   ├── ChooseWord.jsx
│   │   │   ├── DrawBoard.jsx
│   │   │   ├── GuessWord.jsx
│   │   │   ├── PlayerList.jsx
│   │   │   ├── Tools.jsx
│   │   │   └── WordBox.jsx
│   │   │
│   │   ├── pages/
│   │   │   ├── Home.jsx
│   │   │   ├── Lobby.jsx
│   │   │   └── Playground.jsx
│   │   │
│   │   ├── socket/
│   │   │   └── socket.js
│   │   │
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── index.css
│   │
│   ├── vercel.json
│   ├── package.json
│   └── vite.config.js
│
├── server/
│   ├── managers/
│   │   ├── GameManager.js
│   │   └── RoomManager.js
│   │
│   ├── models/
│   │   ├── Player.js
│   │   └── Room.js
│   │
│   ├── socket/
│   │   └── socketHandler.js
│   │
│   ├── utils/
│   │   ├── words.js
│   │   └── helpers.js
│   │
│   ├── index.js
│   └── package.json
│
├── README.md
└── .gitignore
```
---

## System Architecture

### Frontend Responsibilities
- Room creation and joining
- Canvas rendering
- Drawing controls
- Word display
- Guess submission
- Leaderboard updates

### Backend Responsibilities
- Room management
- Player management
- Turn rotation
- Word selection
- Score calculation
- Game state synchronization
- Real-time event broadcasting

---

## Drawing Synchronization

The application uses a stroke-based drawing architecture.

Each drawing action is stored as a stroke containing:

```text
Stroke
 ├── id
 ├── color
 ├── brushSize
 └── points[]
```

Instead of transmitting images, only stroke data is exchanged between clients, reducing bandwidth usage and improving synchronization speed.

---

## Real-Time Events

### Room Events
- create_room
- join_room
- player_joined
- player_left
- start_game

### Game Events
- game_state
- choose_word
- word_selected
- round_end
- game_over

### Drawing Events
- draw_start
- draw_move
- draw_end
- draw_undo
- canvas_clear
- canvas_state

### Guessing Events
- guess_word
- correct_guess
- score_update

---

## Installation

### Frontend

```bash
cd client
npm install
npm run dev
```

### Backend

```bash
cd server
npm install
npm start
```

---

## Learning Outcomes

Through this project, the following concepts were implemented and explored:

- WebSocket-based real-time communication
- Multiplayer game state management
- Canvas drawing synchronization
- Socket.IO event architecture
- React state management
- Turn-based game logic
- Backend room management
- Full-stack application design

---

## Author
Utkarsh Kumar Singh