import express, { Express, Request, Response } from 'express';
import http from 'http';
import { Server, Socket } from 'socket.io';
import dotenv from 'dotenv';
import cors from 'cors';

dotenv.config();

const app: Express = express();
const server = http.createServer(app);
const port = process.env.PORT || 7000;

enum Events {
    RANDOM_LETTER = 'randomLetter',
    SCORE_UPDATE = 'scoreUpdate',
    INCREMENT_SCORE = 'incrementScore',
    WIN = 'win',
    SET_NICKNAME = 'setNickName',
    OPPONENT_UPDATE = 'opponentUpdate',
    JOIN_ROOM = 'joinRoom',
    CREATE_ROOM = 'createRoom',
    ROOM_NOT_FOUND = 'roomNotFound',
    LETTER_UPDATE = 'letterUpdate'
}

app.use(express.json());
app.use(cors());

type Player = {
    playerId: string;
    score: number;
    nickName: string;
    roomId: string;
    winningScore: number;
    currentLetter: string;
};

type Room = {
    roomId: string;
    players: string[];
    winningScore: number;
    currentLetter: string;
    letterArray: string[];
};

type Players = {
    [key: string]: Player;
};

let players: Players = {};
let rooms: Room[] = [];
let letterArray: string[] = [];

const io = new Server(server, {
    cors: {
        origin: 'http://192.168.11.145:3000',
    },
});

io.on('connection', (socket: Socket) => {
    const playerId = socket.id;

    if (!players[playerId]) {
        players[playerId] = { playerId, score: 0, nickName: '', roomId: '', winningScore: 0, currentLetter: '' };
    }

    socket.emit(Events.RANDOM_LETTER, { letter: letterArray[0] });
    socket.emit(Events.SCORE_UPDATE, { playerId, score: players[playerId].score });

    socket.on(Events.INCREMENT_SCORE, () => {
        const player = players[playerId];

        players[playerId].score += 1;
        io.emit(Events.SCORE_UPDATE, { playerId, score: players[playerId].score });

        if (players[playerId].score === player.winningScore) {
            for (const playerId in players) {
                players[playerId].score = 0;
            }

            setTimeout(() => {
                io.emit(Events.WIN);
            }, 0);
        }

        if (letterArray.length > 1) {
            letterArray = letterArray.slice(1);
            players[playerId].currentLetter = letterArray[0];
            io.emit(Events.LETTER_UPDATE, { letter: letterArray[0] });
        } else {
            letterArray = generateLetterArray(10);

            io.emit(Events.LETTER_UPDATE, { letter: letterArray[0] });
        }

        if (players[playerId].score === player.winningScore) {
            for (const playerId in players) {
                players[playerId].score = 0;
            }

            setTimeout(() => {
                io.emit(Events.WIN);
            }, 0);

        }
    });

    socket.on(Events.SET_NICKNAME, ({ nickName, roomId }) => {
        players[playerId].nickName = nickName;
        players[playerId].roomId = roomId;
        players[playerId].currentLetter = letterArray[0];
        io.emit(Events.SET_NICKNAME, { playerId, nickName, roomId, currentLetter: players[playerId].currentLetter });
        io.emit(Events.OPPONENT_UPDATE, Object.values(players));
        io.emit(Events.LETTER_UPDATE, { letter: letterArray[0] });
    });

    socket.on(Events.OPPONENT_UPDATE, () => {
        const player = players[playerId];

        if (player) {
            const roomPlayers = Object.values(players).filter(p => p.roomId === player.roomId);
            socket.emit(Events.OPPONENT_UPDATE, roomPlayers);
        }
    });

    socket.on(Events.JOIN_ROOM, ({ nickName, roomId, winningScore }) => {
        const player = players[socket.id];

        if (player) {
            const targetRoom = rooms.find(room => room.roomId === roomId);

            if (targetRoom) {
                targetRoom.players.push(socket.id);
                player.roomId = roomId;
                player.nickName = nickName;
                player.winningScore = winningScore;
                player.currentLetter = letterArray[0];

                io.emit(Events.SET_NICKNAME, { playerId: socket.id, nickName, roomId, winningScore });
                io.emit(Events.OPPONENT_UPDATE, Object.values(players));
            } else {
                io.to(socket.id).emit(Events.ROOM_NOT_FOUND);
            }
        }
    });

    socket.on(Events.CREATE_ROOM, ({ nickName, winningScore }) => {
        const player = players[socket.id];

        if (player) {
            const newRoomId = generateRoomID();
            const newLetterArray = generateLetterArray(10);
            const firstLetter = newLetterArray[0];
            const newRoom = {
                roomId: newRoomId,
                players: [socket.id],
                winningScore,
                currentLetter: firstLetter,
                letterArray: newLetterArray
            };

            letterArray = newLetterArray;
            rooms.push(newRoom);

            player.roomId = newRoomId;
            player.nickName = nickName;
            player.winningScore = winningScore;
            player.currentLetter = firstLetter;

            io.to(socket.id).emit(Events.CREATE_ROOM, {
                roomId: newRoomId,
                nickName: nickName,
                letterArray: newLetterArray
            });
            const roomPlayers: Player[] = Object.values(players).filter((p: Player) => p.roomId === newRoomId);

            roomPlayers.forEach((p) => {
                io.to(p.playerId).emit(Events.OPPONENT_UPDATE, roomPlayers);
            });

            io.to(player.playerId).emit(Events.LETTER_UPDATE, { letter: firstLetter });
        }
    });

    socket.on('disconnect', () => {
        const player = players[playerId];

        if (player) {
            const roomId = player.roomId;
            delete players[playerId];

            const room = rooms.find(room => room.roomId === roomId);

            if (room) {
                room.players = room.players.filter(p => p !== playerId);
                if (room.players.length === 0) {
                    rooms.splice(rooms.indexOf(room), 1);
                }
            }

            io.emit(Events.OPPONENT_UPDATE, Object.values(players));
        }
    });
});

function generateLetterArray(length: number) {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let result = [];

    for (let i = 0; i < length; i++) {
        const randomIndex = Math.floor(Math.random() * letters.length);
        result.push(letters[randomIndex]);
    }
    return result;
}

function generateRoomID() {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';

    for (let i = 0; i < 6; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }

    return result;
}
app.get('/', (req: Request, res: Response) => {
    res.send('Hello from express!');
});

server.listen(port, () => {
    console.log(`My server is running on port ${port}!`);
});