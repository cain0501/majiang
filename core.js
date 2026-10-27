const ADMIN_NAME = '该隐cain';

export function rid(prefix) {
  return prefix + Math.random().toString(36).slice(2, 8);
}

export function avatarColor(name) {
  const s = String(name || '?');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return 'hsl(' + h + ', 58%, 63%)';
}

export function nextFridayCN(now = Date.now()) {
  const d = new Date(now + 8 * 3600e3);
  const add = (5 - d.getUTCDay() + 7) % 7;
  const t = new Date(d.getTime());
  t.setUTCDate(d.getUTCDate() + add);
  t.setUTCHours(19, 30, 0, 0);
  if (t.getTime() <= d.getTime()) t.setUTCDate(t.getUTCDate() + 7);
  return t.getTime() - 8 * 3600e3;
}

export function blankRoom(now = Date.now(), index = 1, defaults = {}) {
  return {
    id: rid('r'),
    roomNo: String(index),
    title: defaults.title || '活动报名',
    venue: defaults.venue || '待定',
    startAt: Number(defaults.startAt) || nextFridayCN(now),
    durationMin: Number(defaults.durationMin) || 180,
    deadlineMin: Number.isFinite(defaults.deadlineMin) ? defaults.deadlineMin : 120
  };
}

export function blankSession(now = Date.now()) {
  return {
    id: rid('s'),
    rooms: [blankRoom(now, 1)],
    capacity: 4,
    players: []
  };
}

export function defaultState(now = Date.now()) {
  return { members: [], session: blankSession(now), history: [], archivedRooms: [], updatedAt: now };
}

function cleanMembers(list) {
  const out = [];
  (Array.isArray(list) ? list : []).forEach(m => {
    if (!m) return;
    const name = String(m.name || '').trim().slice(0, 8);
    if (!name) return;
    out.push({
      id: m.id || rid('m'),
      name,
      emoji: String(m.emoji || '').slice(0, 4),
      color: m.color || avatarColor(name),
      credit: m.credit == null ? 100 : Math.max(0, Math.min(100, Number(m.credit) || 0))
    });
  });
  return out;
}

function cleanRooms(list, defaults = {}) {
  return (Array.isArray(list) ? list : []).slice(0, 10).map((room, i) => ({
    id: room && room.id ? room.id : rid('r'),
    roomNo: String(room && (room.roomNo || room.name) || i + 1).trim().slice(0, 20) || String(i + 1),
    title: String(room && room.title || defaults.title || '活动报名').trim().slice(0, 20) || '活动报名',
    venue: String(room && room.venue || defaults.venue || '待定').trim().slice(0, 40) || '待定',
    startAt: Number(room && room.startAt) || Number(defaults.startAt) || nextFridayCN(),
    durationMin: Math.max(30, Math.min(720, Number(room && room.durationMin) || Number(defaults.durationMin) || 180)),
    deadlineMin: Math.max(0, Math.min(2880, Number.isFinite(room && room.deadlineMin) ? room.deadlineMin : (Number.isFinite(defaults.deadlineMin) ? defaults.deadlineMin : 120))),
    ...(Number(room && room.startedAt) ? { startedAt: Number(room.startedAt) } : {})
  }));
}

function ensureRooms(session, now = Date.now()) {
  if (Array.isArray(session.rooms) && session.rooms.length === 0) {
    session.capacity = 0;
    return [];
  }

  const raw = Array.isArray(session.rooms) ? session.rooms : [];
  const rich = raw.some(room => room && (room.title || room.startAt || room.venue || room.durationMin));
  if (!raw.length || !rich) {
    const active = Array.isArray(session.players) ? session.players.filter(p => p && !p.cancelled) : [];
    const legacyMax = active.reduce((max, p) => Math.max(max, Number(p.tableNo) || 0), 0);
    const legacyCount = Math.max(1, Math.max(legacyMax, Math.ceil(active.length / 4)));
    const count = Math.min(10, legacyCount);
    const defaults = {
      title: session.title,
      venue: session.venue,
      startAt: session.startAt,
      deadlineMin: session.deadlineMin
    };
    session.rooms = Array.from({ length: count }, (_, i) => blankRoom(now, i + 1, defaults));
    raw.forEach((room, i) => {
      if (session.rooms[i] && room) {
        if (room.name) session.rooms[i].roomNo = String(room.name).trim().slice(0, 20) || String(i + 1);
        if (room.id) session.rooms[i].id = room.id;
      }
    });
  } else {
    session.rooms = cleanRooms(raw);
  }
  session.capacity = session.rooms.length * 4;
  return session.rooms;
}

function roomEndAt(room) {
  return Number(room.startAt) + Number(room.durationMin || 180) * 60000;
}

function deadlineOf(room) {
  return Number(room.startAt) - Number(room.deadlineMin || 0) * 60000;
}

function normalizeRoomAssignments(session, now = Date.now()) {
  const rooms = ensureRooms(session, now);
  const occupied = new Map(rooms.map(room => [room.id, 0]));
  session.players
    .filter(p => !p.cancelled)
    .sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0))
    .forEach(player => {
      const room = rooms.find(item => item.id === player.roomId);
      if (room && now >= roomEndAt(room)) return;
      if (room && now < roomEndAt(room) && occupied.get(room.id) < 4) {
        occupied.set(room.id, occupied.get(room.id) + 1);
        return;
      }
      const next = rooms.find(item => now < roomEndAt(item) && occupied.get(item.id) < 4);
      if (next) {
        player.roomId = next.id;
        occupied.set(next.id, occupied.get(next.id) + 1);
      } else {
        delete player.roomId;
      }
    });
}

function archiveEndedRooms(state, now = Date.now()) {
  const session = state.session;
  const rooms = ensureRooms(session, now);
  const activeCount = room => session.players.filter(player => !player.cancelled && player.roomId === room.id).length;
  const notStarted = rooms.filter(room => now >= room.startAt && !room.startedAt && activeCount(room) < 4);
  rooms.forEach(room => {
    if (now >= room.startAt && activeCount(room) >= 4) room.startedAt = room.startedAt || room.startAt;
  });
  const ended = rooms.filter(room => now >= roomEndAt(room) && room.startedAt);
  const removeIds = new Set([...notStarted, ...ended].map(room => room.id));
  if (!removeIds.size) return;
  state.archivedRooms = Array.isArray(state.archivedRooms) ? state.archivedRooms : [];
  ended.forEach(room => {
    if (state.archivedRooms.some(item => item.id === room.id)) return;
    state.archivedRooms.push({
      ...room,
      endedAt: roomEndAt(room),
      players: session.players.filter(player => player.roomId === room.id),
      results: state.history.filter(entry => entry.roomId === room.id)
    });
  });
  session.rooms = rooms.filter(room => !removeIds.has(room.id));
  session.players = session.players.filter(player => !removeIds.has(player.roomId));
  session.capacity = session.rooms.length * 4;
}

export function normalizeState(st, now = Date.now()) {
  if (!st || typeof st !== 'object' || !st.session) return defaultState(now);

  st.members = cleanMembers(st.members);
  st.history = Array.isArray(st.history) ? st.history : [];
  st.archivedRooms = Array.isArray(st.archivedRooms) ? st.archivedRooms : [];
  st.session.players = Array.isArray(st.session.players) ? st.session.players : [];

  const byName = name => st.members.find(member => member.name === name);
  const make = name => {
    const member = { id: rid('m'), name: String(name).slice(0, 8), emoji: '', color: avatarColor(name) };
    st.members.push(member);
    return member;
  };

  st.session.players = st.session.players.map(player => {
    if (!player) return null;
    if (player.memberId) return { ...player };
    if (!player.name) return null;
    const member = byName(player.name) || make(player.name);
    return {
      memberId: member.id,
      roomId: player.roomId,
      joinedAt: player.joinedAt || now,
      cancelled: !!player.cancelled,
      credit: player.credit == null ? 100 : player.credit
    };
  }).filter(Boolean);

  const rooms = ensureRooms(st.session, now);
  st.session.players.forEach(player => {
    if (!player.roomId && player.tableNo) player.roomId = rooms[Number(player.tableNo) - 1]?.id;
    delete player.tableNo;
  });
  normalizeRoomAssignments(st.session, now);

  st.history = st.history.map(entry => {
    if (!entry) return null;
    const room = entry.roomId
      ? rooms.find(item => item.id === entry.roomId)
      : rooms[(Number(entry.tableNo) || 1) - 1];
    return {
      ...entry,
      roomId: entry.roomId || (room && room.id) || '',
      roomNo: entry.roomNo || (room && room.roomNo) || String(entry.tableNo || 1),
      title: entry.title || (room && room.title) || '活动报名',
      venue: entry.venue || (room && room.venue) || '待定',
      startAt: entry.startAt || entry.date || (room && room.startAt) || now,
      results: (Array.isArray(entry.results) ? entry.results : []).map(result => {
        if (!result) return null;
        if (result.memberId) return { memberId: result.memberId, score: Number(result.score) || 0 };
        if (!result.name) return null;
        const member = byName(result.name) || make(result.name);
        return { memberId: member.id, score: Number(result.score) || 0 };
      }).filter(Boolean)
    };
  }).filter(Boolean);

  archiveEndedRooms(st, now);
  st.members.forEach(member => {
    if (member.credit == null) member.credit = 100;
    st.session.players.forEach(player => {
      if (player.memberId === member.id && player.credit != null && player.credit < member.credit) member.credit = player.credit;
    });
  });
  return st;
}

export function applyOp(state, op, now = Date.now()) {
  normalizeState(state, now);
  const session = state.session;
  const type = op && op.t;
  const members = Array.isArray(state.members) ? state.members : (state.members = []);
  const rooms = () => ensureRooms(session, now);

  if (type === 'members') {
    state.members = cleanMembers(op.list);
    const ids = new Set(state.members.map(member => member.id));
    session.players = session.players.filter(player => ids.has(player.memberId));
  } else if (type === 'join') {
    const memberId = String(op.memberId || '');
    const roomList = rooms();
    const room = roomList.find(item => item.id === op.roomId) || roomList.find(item => now < deadlineOf(item));
    if (members.some(member => member.id === memberId) && room && now < deadlineOf(room)) {
      const existing = session.players.find(player => player.memberId === memberId && !player.cancelled);
      const occupied = session.players.filter(player => !player.cancelled && player.roomId === room.id && player.memberId !== memberId).length;
      if (!existing && occupied < 4) {
        const old = session.players.find(player => player.memberId === memberId);
        if (old) {
          old.cancelled = false;
          old.joinedAt = now;
          old.roomId = room.id;
        } else {
          session.players.push({ memberId, roomId: room.id, joinedAt: now, cancelled: false });
        }
      }
    }
  } else if (type === 'move') {
    const memberId = String(op.memberId || '');
    const room = rooms().find(item => item.id === op.roomId);
    const player = session.players.find(item => item.memberId === memberId && !item.cancelled);
    const occupied = room ? session.players.filter(item => !item.cancelled && item.roomId === room.id && item.memberId !== memberId).length : 4;
    if (player && room && now < deadlineOf(room) && occupied < 4) player.roomId = room.id;
  } else if (type === 'leave') {
    const player = session.players.find(item => item.memberId === op.memberId && !item.cancelled);
    if (player) {
      player.cancelled = true;
      const room = rooms().find(item => item.id === player.roomId);
      if (room && now > deadlineOf(room)) {
        const member = members.find(item => item.id === op.memberId);
        if (member) member.credit = Math.max(0, (member.credit == null ? 100 : member.credit) - 10);
      }
    }
  } else if (type === 'settings') {
    const patch = op.patch || {};
    if (Array.isArray(patch.rooms)) session.rooms = cleanRooms(patch.rooms);
    ensureRooms(session, now);
    normalizeRoomAssignments(session, now);
  } else if (type === 'score') {
    const room = rooms().find(item => item.id === op.roomId)
      || state.archivedRooms.find(item => item.id === op.roomId);
    const results = (Array.isArray(op.results) ? op.results : [])
      .filter(result => result && result.memberId)
      .map(result => ({ memberId: result.memberId, score: Number(result.score) || 0 }));
    if (room && results.length) {
      state.history = state.history.filter(entry => !(entry.roomId === room.id));
      const entry = {
        id: op.id || rid('h'),
        roomId: room.id,
        roomNo: room.roomNo,
        title: room.title,
        venue: room.venue,
        startAt: room.startAt,
        results
      };
      state.history.push(entry);
      const archived = state.archivedRooms.find(item => item.id === room.id);
      if (archived) archived.results = [entry];
    }
  } else if (type === 'unscore') {
    state.history = state.history.filter(entry => entry.id !== op.id);
  } else if (type === 'delete-room') {
    const actor = members.find(member => member.id === op.actorMemberId);
    if (actor && actor.name === ADMIN_NAME && op.roomId) {
      session.rooms = session.rooms.filter(room => room.id !== op.roomId);
      session.players = session.players.filter(player => player.roomId !== op.roomId);
      state.history = state.history.filter(entry => entry.roomId !== op.roomId);
      state.archivedRooms = state.archivedRooms.filter(room => room.id !== op.roomId);
      session.capacity = session.rooms.length * 4;
    }
  } else if (type === 'reset') {
    state.prev = { session: JSON.parse(JSON.stringify(session)), at: now };
    const fresh = blankSession(now);
    fresh.rooms = rooms().map((room, i) => ({ ...room, id: rid('r'), startAt: nextFridayCN(now), roomNo: room.roomNo || String(i + 1) }));
    fresh.capacity = fresh.rooms.length * 4;
    state.session = fresh;
  } else if (type === 'restore') {
    if (state.prev && state.prev.session) {
      state.session = state.prev.session;
      state.prev = null;
    }
  }

  normalizeState(state, now);
  state.updatedAt = now;
  return state;
}

export function activePlayers(state) {
  return state.session.players
    .filter(player => !player.cancelled)
    .sort((a, b) => a.joinedAt - b.joinedAt);
}

export function memberOf(state, id) {
  return (state.members || []).find(member => member.id === id) || null;
}
