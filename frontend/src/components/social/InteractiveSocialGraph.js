import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

/* ───────────────── constants ───────────────── */
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 560;
const CENTER_X = CANVAS_WIDTH / 2;
const CENTER_Y = CANVAS_HEIGHT / 2;
const MAX_VISIBLE_NODES = 100;
const ORBIT_BASE_RADIUS = 100;
const ORBIT_RADIUS_STEP = 60;
const OWNER_RADIUS = 28;
const CIRCLE_NODE_RADIUS = 22;
const MEMBER_NODE_RADIUS = 13;
const MEMBER_ORBIT_RADIUS = 38;
const STAR_COUNT = 180;
const ZOOM_MIN = 0.3;
const ZOOM_MAX = 3.0;
const ZOOM_STEP = 0.15;
const TRANSITION_FRAMES = 60;

/* ──────────── helpers ──────────── */

const isRenderableAvatar = (value = '') => {
  if (!value) return false;
  if (/^\/uploads\/\S+/i.test(value)) return true;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

const getInitials = (label = '') => {
  const cleaned = label.trim();
  if (!cleaned) return '?';
  const parts = cleaned.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return cleaned.slice(0, 2).toUpperCase();
};

const lerp = (a, b, t) => a + (b - a) * t;
const easeInOut = (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
const dist = (ax, ay, bx, by) => Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Draw a rounded rectangle, with fallback for browsers lacking ctx.roundRect. */
const drawRoundRect = (ctx, x, y, w, h, r) => {
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  } else {
    const radius = typeof r === 'number' ? r : 0;
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.arcTo(x + w, y, x + w, y + radius, radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.arcTo(x + w, y + h, x + w - radius, y + h, radius);
    ctx.lineTo(x + radius, y + h);
    ctx.arcTo(x, y + h, x, y + h - radius, radius);
    ctx.lineTo(x, y + radius);
    ctx.arcTo(x, y, x + radius, y, radius);
    ctx.closePath();
  }
};

/* ──────── compute graph data ──────── */

function computeGraphData(circles, profileLabel) {
  const safeCircles = Array.isArray(circles) ? circles : [];
  const ownerLabel = String(profileLabel || 'User').replace(/^@/, '') || 'User';

  const nodes = [];
  const edges = [];
  let mutualCount = 0;

  // Owner node
  const ownerNode = {
    id: '__owner__',
    type: 'owner',
    label: ownerLabel,
    color: null, // set by accentColor at render time
    radius: OWNER_RADIUS,
    orbitRadius: 0,
    orbitAngle: 0,
    orbitSpeed: 0,
    x: CENTER_X,
    y: CENTER_Y,
    targetX: CENTER_X,
    targetY: CENTER_Y,
    avatarUrl: '',
    audience: null,
    isMutual: false,
    username: null,
    realName: null,
    circleName: null,
  };
  nodes.push(ownerNode);

  const membersById = new Map();

  safeCircles.forEach((circle, ci) => {
    const orbitRadius = ORBIT_BASE_RADIUS + ci * ORBIT_RADIUS_STEP;
    const circleAngle = safeCircles.length === 1
      ? -Math.PI / 2
      : ((Math.PI * 2) / safeCircles.length) * ci - Math.PI / 2;

    const audience = circle.relationshipAudience === 'secure' ? 'secure' : 'social';
    const circleId = `circle-${ci}-${circle.name || ci}`;

    const circleNode = {
      id: circleId,
      type: 'circle',
      label: circle.name || `Circle ${ci + 1}`,
      color: circle.color || '#6366f1',
      radius: CIRCLE_NODE_RADIUS,
      orbitRadius,
      orbitAngle: circleAngle,
      orbitSpeed: 0.0003 + ci * 0.00008,
      x: CENTER_X + orbitRadius * Math.cos(circleAngle),
      y: CENTER_Y + orbitRadius * Math.sin(circleAngle),
      targetX: 0,
      targetY: 0,
      avatarUrl: circle.profileImageUrl || '',
      audience,
      isMutual: false,
      username: null,
      realName: null,
      circleName: circle.name,
    };
    nodes.push(circleNode);

    edges.push({ from: ownerNode.id, to: circleId, color: circleNode.color });

    (circle.members || []).forEach((member) => {
      const memberId = String(member?._id || '');
      if (!memberId) return;

      if (!membersById.has(memberId)) {
        membersById.set(memberId, {
          _id: memberId,
          username: member?.username || 'unknown',
          realName: member?.realName || '',
          avatarUrl: member?.avatarUrl || '',
          isMutual: Boolean(member?.isMutual),
          circleIndexes: [ci],
          circleIds: [circleId],
          circleColor: circle.color || '#6366f1',
          audience,
        });
      } else {
        const existing = membersById.get(memberId);
        existing.circleIndexes.push(ci);
        existing.circleIds.push(circleId);
        existing.isMutual = existing.isMutual || Boolean(member?.isMutual);
      }
    });
  });

  // Sort members: mutual first for priority when truncating
  const memberEntries = Array.from(membersById.values())
    .sort((a, b) => (b.isMutual ? 1 : 0) - (a.isMutual ? 1 : 0));

  // Group members by primary circle for even angle distribution
  const membersByCircle = new Map();
  memberEntries.forEach((member) => {
    const key = member.circleIndexes[0];
    if (!membersByCircle.has(key)) membersByCircle.set(key, []);
    membersByCircle.get(key).push(member);
  });

  memberEntries.forEach((member) => {
    if (member.isMutual) mutualCount++;

    const primaryCircleIdx = member.circleIndexes[0];
    const circleMembers = membersByCircle.get(primaryCircleIdx) || [member];
    const indexInCircle = circleMembers.indexOf(member);
    const countInCircle = circleMembers.length;

    const memberAngle = countInCircle === 1
      ? -Math.PI / 2
      : ((Math.PI * 2) / countInCircle) * indexInCircle - Math.PI / 2;

    // Find parent circle node to set initial position relative to it
    const parentCircleId = member.circleIds[0];
    const parentNode = nodes.find((n) => n.id === parentCircleId);
    const parentX = parentNode ? parentNode.x : CENTER_X;
    const parentY = parentNode ? parentNode.y : CENTER_Y;

    const memberNode = {
      id: `member-${member._id}`,
      type: 'member',
      label: member.realName || member.username,
      color: member.circleColor,
      radius: MEMBER_NODE_RADIUS,
      parentCircleId,
      orbitRadius: MEMBER_ORBIT_RADIUS,
      orbitAngle: memberAngle,
      orbitSpeed: 0.0002 + indexInCircle * 0.00003,
      x: parentX + MEMBER_ORBIT_RADIUS * Math.cos(memberAngle),
      y: parentY + MEMBER_ORBIT_RADIUS * Math.sin(memberAngle),
      targetX: 0,
      targetY: 0,
      avatarUrl: member.avatarUrl || '',
      audience: member.audience,
      isMutual: member.isMutual,
      username: member.username,
      realName: member.realName,
      circleName: null,
    };
    nodes.push(memberNode);

    member.circleIds.forEach((cid) => {
      edges.push({ from: cid, to: memberNode.id, color: member.circleColor });
    });
  });

  // Enforce MAX_VISIBLE_NODES: keep owner, then circles, then members (mutual first)
  if (nodes.length > MAX_VISIBLE_NODES) {
    const owners = nodes.filter((n) => n.type === 'owner');
    const circleNodes = nodes.filter((n) => n.type === 'circle');
    const members = nodes.filter((n) => n.type === 'member');
    const budget = MAX_VISIBLE_NODES - owners.length - circleNodes.length;
    const kept = [...owners, ...circleNodes, ...members.slice(0, Math.max(0, budget))];
    const keptIds = new Set(kept.map((n) => n.id));
    const maxOrbitExtent = safeCircles.length > 0
      ? (ORBIT_BASE_RADIUS + (safeCircles.length - 1) * ORBIT_RADIUS_STEP) + MEMBER_ORBIT_RADIUS + MEMBER_NODE_RADIUS
      : OWNER_RADIUS;
    return {
      nodes: kept,
      edges: edges.filter((e) => keptIds.has(e.from) && keptIds.has(e.to)),
      memberCount: membersById.size,
      mutualCount,
      maxOrbitExtent,
    };
  }

  const maxOrbitExtent = safeCircles.length > 0
    ? (ORBIT_BASE_RADIUS + (safeCircles.length - 1) * ORBIT_RADIUS_STEP) + MEMBER_ORBIT_RADIUS + MEMBER_NODE_RADIUS
    : OWNER_RADIUS;
  return { nodes, edges, memberCount: membersById.size, mutualCount, maxOrbitExtent };
}

/* ──────── image cache ──────── */

const imageCache = new Map();

function loadImage(url) {
  if (imageCache.has(url)) return imageCache.get(url);
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = url;
  const entry = { img, loaded: false };
  img.onload = () => { entry.loaded = true; };
  img.onerror = () => { entry.loaded = false; };
  imageCache.set(url, entry);
  return entry;
}

/* ─────────────── force simulation ─────────────── */

function applyForces(nodes, edges, alpha) {
  const REPULSION = 3000;
  const ATTRACTION = 0.005;
  const CENTER_PULL = 0.01;
  const CUTOFF = 300;

  // Repulsion (all pairs within cutoff)
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      if (d > CUTOFF) continue;
      const force = (REPULSION * alpha) / (d * d);
      const fx = (dx / d) * force;
      const fy = (dy / d) * force;
      if (a.type !== 'owner') { a.x += fx; a.y += fy; }
      if (b.type !== 'owner') { b.x -= fx; b.y -= fy; }
    }
  }

  // Attraction along edges
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  edges.forEach((edge) => {
    const a = nodeMap.get(edge.from);
    const b = nodeMap.get(edge.to);
    if (!a || !b) return;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    const force = d * ATTRACTION * alpha;
    const fx = (dx / d) * force;
    const fy = (dy / d) * force;
    if (a.type !== 'owner') { a.x += fx; a.y += fy; }
    if (b.type !== 'owner') { b.x -= fx; b.y -= fy; }
  });

  // Centering force
  nodes.forEach((n) => {
    if (n.type === 'owner') return;
    n.x += (CENTER_X - n.x) * CENTER_PULL * alpha;
    n.y += (CENTER_Y - n.y) * CENTER_PULL * alpha;
  });
}

/* ─────────────── component ─────────────── */

function InteractiveSocialGraph({ circles = [], profileLabel = 'User', accentColor = '#3B82F6' }) {
  const [mode, setMode] = useState('orbit');
  const [selectedNode, setSelectedNode] = useState(null);
  const [hoveredNodeId, setHoveredNodeId] = useState(null);

  const [isDragging, setIsDragging] = useState(false);

  const canvasRef = useRef(null);
  const animFrameRef = useRef(null);
  const nodesRef = useRef([]);
  const edgesRef = useRef([]);
  const zoomRef = useRef(1);
  const panRef = useRef({ x: 0, y: 0 });
  const modeRef = useRef('orbit');
  const transitionRef = useRef({ active: false, frame: 0, total: TRANSITION_FRAMES });
  const timeRef = useRef(0);
  const alphaRef = useRef(1);
  const hoveredRef = useRef(null);
  const dragRef = useRef({ dragging: false, startX: 0, startY: 0, startPanX: 0, startPanY: 0 });

  // Generate star field once
  const starsRef = useRef([]);
  if (starsRef.current.length === 0) {
    const stars = [];
    for (let i = 0; i < STAR_COUNT; i++) {
      stars.push({
        x: Math.random() * CANVAS_WIDTH,
        y: Math.random() * CANVAS_HEIGHT,
        r: Math.random() * 1.2 + 0.3,
        baseOpacity: Math.random() * 0.4 + 0.08,
        phase: Math.random() * Math.PI * 2,
      });
    }
    starsRef.current = stars;
  }

  const { nodes: graphNodes, edges: graphEdges, memberCount, mutualCount, maxOrbitExtent } = useMemo(
    () => computeGraphData(circles, profileLabel),
    [circles, profileLabel],
  );

  // Compute zoom & pan that fits all circles + members inside the viewport
  const { fitZoom, fitPanX, fitPanY } = useMemo(() => {
    const padding = 20;
    const extent = maxOrbitExtent + padding;
    // Determine zoom so the entire extent (radius from center) is visible
    const zoomH = (CANVAS_WIDTH / 2) / extent;
    const zoomV = (CANVAS_HEIGHT / 2) / extent;
    const z = clamp(Math.min(zoomH, zoomV), ZOOM_MIN, ZOOM_MAX);
    return {
      fitZoom: z,
      fitPanX: (CANVAS_WIDTH / 2) * (1 - z),
      fitPanY: (CANVAS_HEIGHT / 2) * (1 - z),
    };
  }, [maxOrbitExtent]);

  // Sync computed data into mutable refs
  useEffect(() => {
    // Preserve positions if nodes haven't changed structurally
    const prevMap = new Map(nodesRef.current.map((n) => [n.id, n]));
    nodesRef.current = graphNodes.map((n) => {
      const prev = prevMap.get(n.id);
      return {
        ...n,
        color: n.type === 'owner' ? accentColor : n.color,
        x: prev ? prev.x : n.x,
        y: prev ? prev.y : n.y,
        targetX: n.x,
        targetY: n.y,
      };
    });
    edgesRef.current = graphEdges;
  }, [graphNodes, graphEdges, accentColor]);

  // Apply fit zoom/pan whenever the circle topology changes
  useEffect(() => {
    zoomRef.current = fitZoom;
    panRef.current = { x: fitPanX, y: fitPanY };
  }, [fitZoom, fitPanX, fitPanY]);

  /* ──── compute orbit positions ──── */
  const computeOrbitPositions = useCallback((time) => {
    const nodeMap = new Map(nodesRef.current.map((n) => [n.id, n]));

    // First pass: owner stays at center, circles orbit the center
    nodesRef.current.forEach((n) => {
      if (n.type === 'owner') {
        n.targetX = CENTER_X;
        n.targetY = CENTER_Y;
      } else if (n.type === 'circle') {
        const angle = n.orbitAngle + time * n.orbitSpeed;
        n.targetX = CENTER_X + n.orbitRadius * Math.cos(angle);
        n.targetY = CENTER_Y + n.orbitRadius * Math.sin(angle);
      }
    });

    // Second pass: members orbit their parent circle
    nodesRef.current.forEach((n) => {
      if (n.type !== 'member') return;
      const parent = n.parentCircleId ? nodeMap.get(n.parentCircleId) : null;
      const cx = parent ? parent.targetX : CENTER_X;
      const cy = parent ? parent.targetY : CENTER_Y;
      const angle = n.orbitAngle + time * n.orbitSpeed;
      n.targetX = cx + n.orbitRadius * Math.cos(angle);
      n.targetY = cy + n.orbitRadius * Math.sin(angle);
    });
  }, []);

  /* ──── compute graph positions ──── */
  const computeGraphPositions = useCallback(() => {
    alphaRef.current = Math.max(alphaRef.current * 0.995, 0.001);
    applyForces(nodesRef.current, edgesRef.current, alphaRef.current);
    // In graph mode targetX/Y track current positions
    nodesRef.current.forEach((n) => {
      n.targetX = n.x;
      n.targetY = n.y;
    });
  }, []);

  /* ──── mode switching ──── */
  const switchMode = useCallback((newMode) => {
    if (newMode === modeRef.current) return;
    modeRef.current = newMode;
    setMode(newMode);
    alphaRef.current = 1;

    // Snapshot current positions as starting point for transition
    nodesRef.current.forEach((n) => {
      n._transStartX = n.x;
      n._transStartY = n.y;
    });
    transitionRef.current = { active: true, frame: 0, total: TRANSITION_FRAMES };
  }, []);

  /* ──── world ↔ screen transforms ──── */
  const screenToWorld = useCallback((sx, sy) => {
    const z = zoomRef.current;
    const p = panRef.current;
    return {
      x: (sx - p.x) / z,
      y: (sy - p.y) / z,
    };
  }, []);

  /* ──── hit test ──── */
  const hitTest = useCallback((wx, wy) => {
    let best = null;
    let bestDist = Infinity;
    for (let i = nodesRef.current.length - 1; i >= 0; i--) {
      const n = nodesRef.current[i];
      const d = dist(wx, wy, n.x, n.y);
      if (d <= n.radius + 4 && d < bestDist) {
        best = n;
        bestDist = d;
      }
    }
    return best;
  }, []);

  /* ──── canvas mouse → world coords ──── */
  const canvasToWorld = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = CANVAS_WIDTH / rect.width;
    const scaleY = CANVAS_HEIGHT / rect.height;
    const sx = (e.clientX - rect.left) * scaleX;
    const sy = (e.clientY - rect.top) * scaleY;
    return screenToWorld(sx, sy);
  }, [screenToWorld]);

  /* ──── draw ──── */
  const draw = useCallback((ctx) => {
    const z = zoomRef.current;
    const p = panRef.current;
    const hovered = hoveredRef.current;
    const sel = selectedNode;
    const currentMode = modeRef.current;

    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Background gradient
    const grad = ctx.createLinearGradient(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    grad.addColorStop(0, '#0f172a');
    grad.addColorStop(0.5, '#1e1b4b');
    grad.addColorStop(1, '#0c4a6e');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Star field (drawn in screen space before pan/zoom)
    const time = timeRef.current;
    starsRef.current.forEach((star) => {
      const twinkle = 0.6 + 0.4 * Math.sin(time * 0.0008 + star.phase);
      const opacity = star.baseOpacity * twinkle;
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
      ctx.fill();
    });

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(z, z);

    // Viewport bounds for culling (in world coords)
    const vpLeft = -p.x / z - 50;
    const vpTop = -p.y / z - 50;
    const vpRight = (CANVAS_WIDTH - p.x) / z + 50;
    const vpBottom = (CANVAS_HEIGHT - p.y) / z + 50;
    const inView = (n) => n.x >= vpLeft && n.x <= vpRight && n.y >= vpTop && n.y <= vpBottom;

    const dimmed = sel != null;

    // 1. Orbit rings (orbit mode only)
    if (currentMode === 'orbit') {
      const drawnRadii = new Set();
      nodesRef.current.forEach((n) => {
        if (n.type === 'circle' && !drawnRadii.has(n.orbitRadius)) {
          drawnRadii.add(n.orbitRadius);
          const ringColor = n.audience === 'secure'
            ? 'rgba(245, 158, 11, 0.12)'
            : 'rgba(99, 102, 241, 0.12)';
          ctx.beginPath();
          ctx.arc(CENTER_X, CENTER_Y, n.orbitRadius, 0, Math.PI * 2);
          ctx.strokeStyle = ringColor;
          ctx.lineWidth = 1.5;
          ctx.setLineDash([6, 4]);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      });
      // Member orbit rings around each circle
      const circlesWithMembers = new Set();
      nodesRef.current.forEach((n) => {
        if (n.type === 'member' && n.parentCircleId) circlesWithMembers.add(n.parentCircleId);
      });
      nodesRef.current.forEach((n) => {
        if (n.type === 'circle' && circlesWithMembers.has(n.id)) {
          ctx.beginPath();
          ctx.arc(n.x, n.y, MEMBER_ORBIT_RADIUS, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
          ctx.lineWidth = 0.8;
          ctx.setLineDash([3, 3]);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      });
    }

    // 2. Edges
    const nodeMap = new Map(nodesRef.current.map((n) => [n.id, n]));
    edgesRef.current.forEach((edge) => {
      const a = nodeMap.get(edge.from);
      const b = nodeMap.get(edge.to);
      if (!a || !b) return;
      if (!inView(a) && !inView(b)) return;
      const isHighlight = hovered && (hovered.id === a.id || hovered.id === b.id);
      const opacity = dimmed && !isHighlight ? 0.08 : isHighlight ? 0.6 : 0.2;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = edge.color || '#94a3b8';
      ctx.globalAlpha = opacity;
      ctx.lineWidth = isHighlight ? 1.8 : 0.8;
      if (isHighlight) {
        ctx.shadowColor = edge.color || '#94a3b8';
        ctx.shadowBlur = 6;
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    });

    // 3. Nodes (draw owner last so it's on top)
    const sortedNodes = [...nodesRef.current].sort((a, b) => {
      if (a.type === 'owner') return 1;
      if (b.type === 'owner') return -1;
      if (a.type === 'circle' && b.type === 'member') return 1;
      if (a.type === 'member' && b.type === 'circle') return -1;
      return 0;
    });

    sortedNodes.forEach((n) => {
      if (!inView(n)) return;
      const isHovered = hovered && hovered.id === n.id;
      const isSel = sel && sel.id === n.id;
      const nodeDimmed = dimmed && !isSel && !isHovered;
      const alpha = nodeDimmed ? 0.25 : 1;

      ctx.globalAlpha = alpha;

      // Glow
      if (isHovered || isSel || n.type === 'owner') {
        ctx.shadowColor = n.color || accentColor;
        ctx.shadowBlur = isHovered ? 18 : n.type === 'owner' ? 12 : 6;
      }

      // Audience tinted outer ring for circles
      if (n.type === 'circle') {
        const ringTint = n.audience === 'secure'
          ? 'rgba(245, 158, 11, 0.35)'
          : 'rgba(129, 140, 248, 0.3)';
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius + 4, 0, Math.PI * 2);
        ctx.fillStyle = ringTint;
        ctx.fill();
      }

      // Main circle
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
      ctx.fillStyle = n.color || accentColor;
      ctx.fill();

      // Mutual friend gold ring
      if (n.isMutual && n.type === 'member') {
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius + 2, 0, Math.PI * 2);
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      ctx.shadowBlur = 0;

      // Avatar image
      const avatarUrl = n.avatarUrl;
      if (isRenderableAvatar(avatarUrl)) {
        const entry = loadImage(avatarUrl);
        if (entry.loaded) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.radius - 1, 0, Math.PI * 2);
          ctx.clip();
          const sz = (n.radius - 1) * 2;
          ctx.drawImage(entry.img, n.x - n.radius + 1, n.y - n.radius + 1, sz, sz);
          ctx.restore();
        }
      }

      // Initials / label text
      if (!isRenderableAvatar(avatarUrl) || !loadImage(avatarUrl).loaded) {
        ctx.fillStyle = '#ffffff';
        const fontSize = n.type === 'owner' ? 11 : n.type === 'circle' ? 9 : 7;
        ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const text = n.type === 'circle'
          ? n.label.slice(0, 9)
          : n.type === 'owner'
            ? n.label.slice(0, 6)
            : getInitials(n.label);
        ctx.fillText(text, n.x, n.y);
      }

      ctx.globalAlpha = 1;
    });

    // 4. Hover tooltip
    if (hovered && inView(hovered)) {
      const tipText = hovered.label + (hovered.isMutual ? ' ★' : '');
      ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      const metrics = ctx.measureText(tipText);
      const tw = metrics.width + 14;
      const th = 22;
      const tx = hovered.x - tw / 2;
      const ty = hovered.y - hovered.radius - th - 6;

      ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
      drawRoundRect(ctx, tx, ty, tw, th, 5);
      ctx.fill();
      ctx.fillStyle = '#f1f5f9';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(tipText, hovered.x, ty + th / 2);
    }

    ctx.restore();
  }, [accentColor, selectedNode]);

  /* ──── animation loop ──── */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let running = true;
    let lastTimestamp = 0;

    const tick = (timestamp) => {
      if (!running) return;
      const delta = lastTimestamp ? timestamp - lastTimestamp : 16;
      lastTimestamp = timestamp;
      timeRef.current += delta;

      const currentMode = modeRef.current;
      const tr = transitionRef.current;

      if (currentMode === 'orbit') {
        computeOrbitPositions(timeRef.current);
      } else {
        computeGraphPositions();
      }

      if (tr.active) {
        tr.frame++;
        const t = easeInOut(clamp(tr.frame / tr.total, 0, 1));
        nodesRef.current.forEach((n) => {
          n.x = lerp(n._transStartX ?? n.x, n.targetX, t);
          n.y = lerp(n._transStartY ?? n.y, n.targetY, t);
        });
        if (tr.frame >= tr.total) {
          tr.active = false;
          nodesRef.current.forEach((n) => {
            n.x = n.targetX;
            n.y = n.targetY;
            delete n._transStartX;
            delete n._transStartY;
          });
        }
      } else if (currentMode === 'orbit') {
        // Directly place on orbit
        nodesRef.current.forEach((n) => {
          n.x = n.targetX;
          n.y = n.targetY;
        });
      }

      draw(ctx);
      animFrameRef.current = requestAnimationFrame(tick);
    };

    animFrameRef.current = requestAnimationFrame(tick);

    return () => {
      running = false;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [draw, computeOrbitPositions, computeGraphPositions]);

  /* ──── mouse handlers ──── */
  const handleMouseMove = useCallback((e) => {
    const w = canvasToWorld(e);
    const drag = dragRef.current;

    if (drag.dragging) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const scaleX = CANVAS_WIDTH / rect.width;
      const scaleY = CANVAS_HEIGHT / rect.height;
      const sx = (e.clientX - rect.left) * scaleX;
      const sy = (e.clientY - rect.top) * scaleY;
      panRef.current = {
        x: drag.startPanX + (sx - drag.startX),
        y: drag.startPanY + (sy - drag.startY),
      };
      return;
    }

    const hit = hitTest(w.x, w.y);
    hoveredRef.current = hit;
    setHoveredNodeId(hit ? hit.id : null);
  }, [canvasToWorld, hitTest]);

  const handleMouseDown = useCallback((e) => {
    const w = canvasToWorld(e);
    const hit = hitTest(w.x, w.y);

    if (hit) {
      // Clicked on a node
      setSelectedNode((prev) => (prev && prev.id === hit.id ? null : {
        id: hit.id,
        type: hit.type,
        name: hit.label,
        subtitle: hit.type === 'member'
          ? (hit.isMutual ? `@${hit.username} • Mutual friend` : `@${hit.username}`)
          : hit.type === 'circle'
            ? (hit.audience === 'secure' ? 'Secure circle' : 'Social circle')
            : 'You',
        avatarUrl: hit.avatarUrl,
        username: hit.username,
      }));
      return;
    }

    // Start panning
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = CANVAS_WIDTH / rect.width;
    const scaleY = CANVAS_HEIGHT / rect.height;
    const sx = (e.clientX - rect.left) * scaleX;
    const sy = (e.clientY - rect.top) * scaleY;
    dragRef.current = {
      dragging: true,
      startX: sx,
      startY: sy,
      startPanX: panRef.current.x,
      startPanY: panRef.current.y,
    };
    setIsDragging(true);
  }, [canvasToWorld, hitTest]);

  const handleMouseUp = useCallback(() => {
    dragRef.current.dragging = false;
    setIsDragging(false);
  }, []);

  const handleMouseLeave = useCallback(() => {
    dragRef.current.dragging = false;
    setIsDragging(false);
    hoveredRef.current = null;
    setHoveredNodeId(null);
  }, []);

  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
    zoomRef.current = clamp(zoomRef.current + delta, ZOOM_MIN, ZOOM_MAX);
  }, []);

  // Attach wheel with { passive: false }
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  /* ──── zoom controls ──── */
  const zoomIn = useCallback(() => {
    zoomRef.current = clamp(zoomRef.current + ZOOM_STEP, ZOOM_MIN, ZOOM_MAX);
  }, []);

  const zoomOut = useCallback(() => {
    zoomRef.current = clamp(zoomRef.current - ZOOM_STEP, ZOOM_MIN, ZOOM_MAX);
  }, []);

  const resetView = useCallback(() => {
    zoomRef.current = fitZoom;
    panRef.current = { x: fitPanX, y: fitPanY };
  }, [fitZoom, fitPanX, fitPanY]);

  /* ──── cursor style ──── */
  const cursorStyle = isDragging
    ? 'grabbing'
    : hoveredNodeId
      ? 'pointer'
      : 'grab';

  /* ──── empty state ──── */
  if (!Array.isArray(circles) || circles.length === 0) {
    return (
      <p className="rounded-2xl bg-white/55 px-4 py-4 text-sm text-slate-500">
        No circles available yet.
      </p>
    );
  }

  return (
    <div className="space-y-3" data-testid="interactive-social-graph">
      <p className="text-xs uppercase tracking-wide text-slate-500">
        Interactive circle map • {memberCount} members • {mutualCount} mutual
      </p>

      <div
        className="relative overflow-hidden rounded-2xl border border-slate-200 shadow-sm"
        style={{
          background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0c4a6e 100%)',
        }}
      >
        {/* Mode toggle */}
        <div className="absolute top-3 right-3 z-10 flex gap-2">
          <button
            type="button"
            data-testid="mode-toggle-orbit"
            onClick={() => switchMode('orbit')}
            className={`rounded-lg px-3 py-1 text-xs font-semibold backdrop-blur transition-colors ${
              mode === 'orbit'
                ? 'bg-white/90 text-slate-900 shadow'
                : 'bg-white/20 text-white/80 hover:bg-white/30'
            }`}
          >
            Orbit
          </button>
          <button
            type="button"
            data-testid="mode-toggle-graph"
            onClick={() => switchMode('graph')}
            className={`rounded-lg px-3 py-1 text-xs font-semibold backdrop-blur transition-colors ${
              mode === 'graph'
                ? 'bg-white/90 text-slate-900 shadow'
                : 'bg-white/20 text-white/80 hover:bg-white/30'
            }`}
          >
            Graph
          </button>
        </div>

        {/* Zoom controls */}
        <div className="absolute bottom-3 right-3 z-10 flex flex-col gap-1">
          <button
            type="button"
            onClick={zoomIn}
            className="grid h-7 w-7 place-items-center rounded-lg bg-white/20 text-sm font-bold text-white/80 backdrop-blur hover:bg-white/30"
            aria-label="Zoom in"
          >
            +
          </button>
          <button
            type="button"
            onClick={resetView}
            className="grid h-7 w-7 place-items-center rounded-lg bg-white/20 text-sm text-white/80 backdrop-blur hover:bg-white/30"
            aria-label="Reset view"
          >
            ⟲
          </button>
          <button
            type="button"
            onClick={zoomOut}
            className="grid h-7 w-7 place-items-center rounded-lg bg-white/20 text-sm font-bold text-white/80 backdrop-blur hover:bg-white/30"
            aria-label="Zoom out"
          >
            −
          </button>
        </div>

        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          style={{ width: '100%', height: 'auto', cursor: cursorStyle, display: 'block' }}
          onMouseMove={handleMouseMove}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
        />
      </div>

      {/* Selected node detail panel */}
      {selectedNode && (
        <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white/95 px-4 py-3 shadow-md">
          {isRenderableAvatar(selectedNode.avatarUrl) ? (
            <img
              src={selectedNode.avatarUrl}
              alt=""
              className="h-11 w-11 flex-shrink-0 rounded-full object-cover ring-2 ring-violet-200"
            />
          ) : (
            <span className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-full bg-violet-100 text-base font-bold text-violet-700 ring-2 ring-violet-200">
              {(selectedNode.name || '?').charAt(0).toUpperCase()}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-slate-900">{selectedNode.name}</p>
            <p className="truncate text-xs text-slate-500">{selectedNode.subtitle}</p>
            {selectedNode.type === 'member' && selectedNode.username ? (
              <Link
                to={`/social?user=${encodeURIComponent(selectedNode.username)}`}
                onClick={() => setSelectedNode(null)}
                className="mt-1.5 inline-block rounded-lg bg-violet-600 px-3 py-1 text-xs font-semibold text-white hover:bg-violet-700"
              >
                View Full Profile
              </Link>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => setSelectedNode(null)}
            className="flex-shrink-0 rounded-full p-1 text-xs text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            ✕
          </button>
        </div>
      )}

      <p className="text-xs text-slate-500">
        Viewing circles for{' '}
        <span className="font-semibold text-slate-700">@{String(profileLabel || 'User').replace(/^@/, '')}</span>.
        Scroll to zoom, drag to pan. Click nodes for details.
      </p>
    </div>
  );
}

export default InteractiveSocialGraph;
