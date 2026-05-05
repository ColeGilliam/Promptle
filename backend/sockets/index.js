import { Server } from "socket.io";
import { setIo } from "./socketState.js";
import { markRoomStarted, getRoomMode } from "../controllers/gameController.js";
import { validateProfileUsernameRules } from "../services/profileModeration.js";
import { filterProfanity } from "../services/profanityFilter.js";
import { appLogger } from "../lib/logger.js";

const socketLogger = appLogger.child({ component: 'socket' });

export function setupSocket(server) {
  const io = new Server(server, {
    cors: {
      origin: [
        'http://localhost:8080',
        'https://promptle.unr.dev',
      ],
      methods: ['GET', 'POST'],
      credentials: true
    },
    allowEIO3: true,
  });

  setIo(io);

  const playerNames = new Map();   // socketId → playerName
  const roomHosts = new Map();     // roomId → host socketId
  const playerGuesses = new Map(); // socketId → guess count (reset each game)
  const gameModes = new Map();     // roomId → 'standard' | '1v1'
  const turnStates = new Map();    // roomId → { socketIds, currentIdx, timer }
  const startedRooms = new Set();  // roomIds that have already started
  const roomDeviceIds = new Map(); // roomId → Map(deviceId → socketId)

  // ─── Turn helpers ──────────────────────────────────────────────────────
  function startTurnTimer(roomId, timeoutSecs = 30) {
    const state = turnStates.get(roomId);
    if (!state) return;
    if (state.timer) clearTimeout(state.timer);

    state.timer = setTimeout(() => {
      const s = turnStates.get(roomId);
      if (!s) return;
      const skippedName = playerNames.get(s.socketIds[s.currentIdx]) || 'Guest';
      s.currentIdx = (s.currentIdx + 1) % s.socketIds.length;
      s.timer = null;
      const nextSocketId = s.socketIds[s.currentIdx];
      const nextPlayerName = playerNames.get(nextSocketId) || 'Guest';
      io.to(roomId).emit('1v1-turn-change', {
        currentTurnSocketId: nextSocketId,
        currentTurnPlayerName: nextPlayerName,
        skipped: true,
        skippedPlayerName: skippedName,
      });
      startTurnTimer(roomId, timeoutSecs);
    }, timeoutSecs * 1000);
  }

  function advanceTurn(roomId, timeoutSecs = 30) {
    const state = turnStates.get(roomId);
    if (!state) return;
    state.currentIdx = (state.currentIdx + 1) % state.socketIds.length;
    const nextSocketId = state.socketIds[state.currentIdx];
    const nextPlayerName = playerNames.get(nextSocketId) || 'Guest';
    io.to(roomId).emit('1v1-turn-change', {
      currentTurnSocketId: nextSocketId,
      currentTurnPlayerName: nextPlayerName,
    });
    startTurnTimer(roomId, timeoutSecs);
  }

  // ─── Connection handler ────────────────────────────────────────────────
  io.on('connection', (socket) => {
    socketLogger.debug('socket_connected', {
      socketId: socket.id,
    });

    socket.on('join-room', async ({ roomId, playerName, deviceId }) => {
      if (!roomId || typeof roomId !== 'string' || roomId.trim() === '') {
        socketLogger.warn('socket_join_invalid_room', {
          socketId: socket.id,
          roomId: roomId || null,
          deviceId: deviceId || null,
        });
        socket.emit('error', 'Invalid room ID');
        return;
      }

      const cleanRoom = roomId.trim();

      // Reject if game has already started
      if (startedRooms.has(cleanRoom)) {
        socketLogger.warn('socket_join_started_room_rejected', {
          socketId: socket.id,
          roomId: cleanRoom,
          deviceId: deviceId || null,
        });
        socket.emit('join-error', { message: 'This game has already started. Please join another room.' });
        return;
      }

      // Reject duplicate device (same browser already in this room)
      if (deviceId) {
        const deviceMap = roomDeviceIds.get(cleanRoom);
        if (deviceMap && deviceMap.has(deviceId)) {
          socketLogger.warn('socket_join_duplicate_device', {
            socketId: socket.id,
            roomId: cleanRoom,
            deviceId,
            existingSocketId: deviceMap.get(deviceId),
          });
          socket.emit('join-error', { message: 'You are already in this room from another tab.' });
          return;
        }
      }

      // Enforce 2-player limit for 1v1 rooms
      const roomMode = await getRoomMode(cleanRoom);
      if (roomMode === '1v1') {
        const existingSockets = io.sockets.adapter.rooms.get(cleanRoom) || new Set();
        if (existingSockets.size >= 2) {
          socketLogger.warn('socket_join_room_full', {
            socketId: socket.id,
            roomId: cleanRoom,
            mode: roomMode,
            playerCount: existingSockets.size,
          });
          socket.emit('join-error', { message: 'This 1v1 room is full (max 2 players)' });
          return;
        }
      }

      const requestedName =
        typeof playerName === 'string' && playerName.trim()
          ? playerName
          : 'Guest';
      const usernameValidation = validateProfileUsernameRules(requestedName);
      if (!usernameValidation.isValid) {
        socketLogger.warn('socket_join_invalid_username', {
          socketId: socket.id,
          roomId: cleanRoom,
          requestedName,
          reason: usernameValidation.error,
        });
        socket.emit('join-error', { message: usernameValidation.error });
        return;
      }

      const approvedName = usernameValidation.normalizedUsername;

      // Store the approved name once so later socket events cannot spoof it.
      playerNames.set(socket.id, approvedName);
      socket.join(cleanRoom);

      // Track device ID for this room
      if (deviceId) {
        if (!roomDeviceIds.has(cleanRoom)) roomDeviceIds.set(cleanRoom, new Map());
        roomDeviceIds.get(cleanRoom).set(deviceId, socket.id);
      }
      socketLogger.debug('socket_joined_room', {
        socketId: socket.id,
        roomId: cleanRoom,
        playerName: approvedName,
        deviceId: deviceId || null,
        mode: roomMode,
      });

      if (!roomHosts.has(cleanRoom)) {
        roomHosts.set(cleanRoom, socket.id);
        socketLogger.debug('socket_room_host_assigned', {
          roomId: cleanRoom,
          socketId: socket.id,
          playerName: approvedName,
        });
      }

      const isHost = roomHosts.get(cleanRoom) === socket.id;
      socket.emit('host-status', { isHost });

      const roomSockets = io.sockets.adapter.rooms.get(cleanRoom) || new Set();
      const players = Array.from(roomSockets).map((clientId) => ({
        id: clientId,
        name: playerNames.get(clientId) || 'Guest'
      }));

      socketLogger.debug('socket_room_players_updated', {
        roomId: cleanRoom,
        players,
      });
      io.to(cleanRoom).emit('players-updated', { roomId: cleanRoom, players });
      socket.emit('joined-room', { roomId: cleanRoom, message: `Joined ${cleanRoom}` });
    });

    socket.on('start-game', ({ roomId, mode }) => {
      if (roomHosts.get(roomId) !== socket.id) return;
      socketLogger.debug('socket_game_started', {
        roomId,
        socketId: socket.id,
        playerName: playerNames.get(socket.id) || 'Guest',
        mode,
      });
      markRoomStarted(roomId);
      startedRooms.add(roomId);

      // Reset guess counts for all players in the room so counts don't carry over from previous games
      const roomSocketIds = Array.from(io.sockets.adapter.rooms.get(roomId) || new Set());
      roomSocketIds.forEach(socketId => playerGuesses.set(socketId, 0));

      if (mode === '1v1') {
        gameModes.set(roomId, '1v1');
        const roomSockets = Array.from(io.sockets.adapter.rooms.get(roomId) || new Set());
        const firstIdx = Math.floor(Math.random() * roomSockets.length);
        turnStates.set(roomId, { socketIds: roomSockets, currentIdx: firstIdx, timer: null });
        const firstSocketId = roomSockets[firstIdx];
        const firstPlayerName = playerNames.get(firstSocketId) || 'Guest';
        io.to(roomId).emit('1v1-started', {
          currentTurnSocketId: firstSocketId,
          currentTurnPlayerName: firstPlayerName,
        });
        startTurnTimer(roomId, 30);
      } else {
        io.to(roomId).emit('game-started');
      }
    });

    socket.on('1v1-submit-guess', ({ roomId, guessValues, guessColors, isCorrect, finishMs }) => {
      const state = turnStates.get(roomId);
      if (!state) return;

      const currentSocketId = state.socketIds[state.currentIdx];
      if (socket.id !== currentSocketId) return; // not their turn

      if (state.timer) { clearTimeout(state.timer); state.timer = null; }

      playerGuesses.set(socket.id, (playerGuesses.get(socket.id) || 0) + 1);
      const guesses = playerGuesses.get(socket.id);
      const approvedName = playerNames.get(socket.id) || 'Guest';

      // Broadcast the server-approved name instead of trusting client payloads.
      io.to(roomId).emit('1v1-guess-made', {
        guesserSocketId: socket.id,
        guesserName: approvedName,
        guessValues,
        guessColors,
        isCorrect,
        finishMs,
        guesses,
      });

      if (isCorrect) {
        io.to(roomId).emit('1v1-game-over', {
          winnerId: socket.id,
          winnerName: approvedName,
          guessCount: guesses,
          finishMs,
        });
        turnStates.delete(roomId);
        gameModes.delete(roomId);
      } else {
        advanceTurn(roomId, 30);
      }
    });

    socket.on('1v1-use-skip', ({ roomId }) => {
      const state = turnStates.get(roomId);
      if (!state) return;

      const currentSocketId = state.socketIds[state.currentIdx];
      if (socket.id === currentSocketId) return; // can't skip your own turn

      // Clear the current turn timer
      if (state.timer) { clearTimeout(state.timer); state.timer = null; }

      const skippedName = playerNames.get(currentSocketId) || 'Guest';
      const skipperIdx  = state.socketIds.indexOf(socket.id);
      if (skipperIdx === -1) return;

      // Advance directly to the skipper's turn
      state.currentIdx = skipperIdx;
      io.to(roomId).emit('1v1-turn-change', {
        currentTurnSocketId: socket.id,
        currentTurnPlayerName: playerNames.get(socket.id) || 'Guest',
        skipped: true,
        skippedPlayerName: skippedName,
      });
      startTurnTimer(roomId, 30);
    });

    socket.on('use-powerup', ({ roomId, type }) => {
      const approvedName = playerNames.get(socket.id) || 'Guest';
      socketLogger.debug('socket_powerup_used', {
        roomId,
        socketId: socket.id,
        playerName: approvedName,
        type,
      });
      socket.to(roomId).emit('powerup-effect', { type, fromPlayerName: approvedName });
    });

    socket.on('player-guess', ({ roomId, colors, values, isCorrect, finishTime }) => {
      playerGuesses.set(socket.id, (playerGuesses.get(socket.id) || 0) + 1);
      const guesses = playerGuesses.get(socket.id);
      const approvedName = playerNames.get(socket.id) || 'Guest';

      // Broadcast the server-approved name instead of trusting client payloads.
      socket.to(roomId).emit('opponent-guess', {
        playerName: approvedName,
        playerId: socket.id,
        colors,
        values,
        isCorrect,
        finishTime,
        guesses,
      });

      if (isCorrect) {
        const score = Math.max(100, 1000 - (guesses - 1) * 100);
        io.to(roomId).emit('player-won', {
          playerName: approvedName,
          playerId: socket.id,
          guesses,
          finishTime,
          score,
        });
      }
    });

    socket.on('chat message', async (data) => {
      let room = 'general';
      let message = '';
      if (typeof data === 'string') {
        message = data;
      } else if (data && typeof data.room === 'string' && typeof data.text === 'string') {
        room = data.room.trim();
        message = data.text.trim();
      }
      if (!message) return;
      const senderName = playerNames.get(socket.id) || 'Unknown';
      const filteredMessage = await filterProfanity(message);

      socketLogger.debug('socket_chat_message', {
        roomId: room,
        socketId: socket.id,
        senderName,
        messageLength: message.length,
      });
      io.to(room).emit('chat message', { senderName, text: filteredMessage });
    });

    socket.on('leave-room', () => {
      const gameRooms = Array.from(socket.rooms).filter(r => r !== socket.id);

      gameRooms.forEach(room => {
        // Free the device ID so they can rejoin
        const deviceMap = roomDeviceIds.get(room);
        if (deviceMap) {
          deviceMap.forEach((socketId, deviceId) => {
            if (socketId === socket.id) deviceMap.delete(deviceId);
          });
        }

        // Leave the Socket.io room first so the updated list excludes them
        socket.leave(room);

        // Broadcast updated player list to remaining players
        const roomSockets = io.sockets.adapter.rooms.get(room) || new Set();
        const players = Array.from(roomSockets).map(clientId => ({
          id: clientId,
          name: playerNames.get(clientId) || 'Guest'
        }));
        io.to(room).emit('players-updated', { roomId: room, players });

        // If host left, clear host so next joiner becomes host
        if (roomHosts.get(room) === socket.id) roomHosts.delete(room);
      });

      playerGuesses.delete(socket.id);
    });

    socket.on('delete-room', ({ roomId }) => {
      if (!roomId) return;
      socketLogger.debug('socket_room_deleted', {
        roomId,
        socketId: socket.id,
      });
      startedRooms.delete(roomId);
      roomDeviceIds.delete(roomId);
      io.to(roomId).emit('room-deleted');
      // Disconnect all sockets from the room
      const roomSockets = io.sockets.adapter.rooms.get(roomId);
      if (roomSockets) {
        roomSockets.forEach(socketId => {
          io.sockets.sockets.get(socketId)?.leave(roomId);
        });
      }
    });

    // 'disconnecting' fires while socket.rooms is still populated — use this for room broadcasts
    socket.on('disconnecting', () => {
      const leavingRooms = Array.from(socket.rooms).filter(r => r !== socket.id);

      // Remove device ID entry for this socket from its rooms so the player can rejoin
      leavingRooms.forEach(room => {
        const deviceMap = roomDeviceIds.get(room);
        if (deviceMap) {
          deviceMap.forEach((socketId, deviceId) => {
            if (socketId === socket.id) deviceMap.delete(deviceId);
          });
        }
      });

      // Broadcast updated player list (excluding disconnecting socket) to each room
      leavingRooms.forEach(room => {
        const roomSockets = io.sockets.adapter.rooms.get(room) || new Set();
        const players = Array.from(roomSockets)
          .filter(id => id !== socket.id)
          .map(clientId => ({
            id: clientId,
            name: playerNames.get(clientId) || 'Guest'
          }));
        io.to(room).emit('players-updated', { roomId: room, players });
      });

      // Handle 1v1 turn state cleanup
      turnStates.forEach((state, roomId) => {
        const idx = state.socketIds.indexOf(socket.id);
        if (idx === -1) return;

        state.socketIds.splice(idx, 1);
        if (state.socketIds.length === 0) {
          if (state.timer) clearTimeout(state.timer);
          turnStates.delete(roomId);
          gameModes.delete(roomId);
        } else {
          if (state.currentIdx >= state.socketIds.length) state.currentIdx = 0;
          if (state.timer) { clearTimeout(state.timer); state.timer = null; }
          const nextSocketId = state.socketIds[state.currentIdx];
          const nextPlayerName = playerNames.get(nextSocketId) || 'Guest';
          io.to(roomId).emit('1v1-player-disconnected', { playerName: playerNames.get(socket.id) || 'Guest' });
          io.to(roomId).emit('1v1-turn-change', {
            currentTurnSocketId: nextSocketId,
            currentTurnPlayerName: nextPlayerName,
          });
          startTurnTimer(roomId, 30);
        }
      });

      roomHosts.forEach((hostId, roomId) => {
        if (hostId === socket.id) roomHosts.delete(roomId);
      });
    });

    // 'disconnect' fires after rooms are cleared — use only for map cleanup
    socket.on('disconnect', () => {
      socketLogger.debug('socket_disconnected', {
        socketId: socket.id,
      });
      playerNames.delete(socket.id);
      playerGuesses.delete(socket.id);
    });
  });

  io.engine.on("connection_error", (err) => {
    socketLogger.warn('socket_engine_connection_error', {
      url: err.req?.url || null,
      code: err.code || null,
      message: err.message || null,
      context: err.context || null,
    });
  });

  return io;
}
