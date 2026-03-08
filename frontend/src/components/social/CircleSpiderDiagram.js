import React, { useMemo, useState } from 'react';

const CENTER_X = 240;
const CENTER_Y = 180;
const CIRCLE_RADIUS = 95;
const MEMBER_RADIUS = 155;

const polarToCartesian = (radius, angleRadians) => ({
  x: CENTER_X + (radius * Math.cos(angleRadians)),
  y: CENTER_Y + (radius * Math.sin(angleRadians))
});

function CircleSpiderDiagram({ circles = [], profileLabel = 'User', accentColor = '#3B82F6' }) {
  const [activeKey, setActiveKey] = useState('');

  const { circleNodes, memberNodes, edges, mutualCount } = useMemo(() => {
    const safeCircles = Array.isArray(circles) ? circles : [];
    const membersById = new Map();
    let mutualTotal = 0;

    const computedCircleNodes = safeCircles.map((circle, index) => {
      const angle = ((Math.PI * 2) / Math.max(safeCircles.length, 1)) * index - (Math.PI / 2);
      return {
        key: `circle-${circle.name}-${index}`,
        name: circle.name,
        audience: circle.relationshipAudience === 'secure' ? 'secure' : 'social',
        color: circle.color || accentColor,
        point: polarToCartesian(CIRCLE_RADIUS, angle)
      };
    });

    safeCircles.forEach((circle, circleIndex) => {
      (circle.members || []).forEach((member) => {
        const memberId = String(member?._id || '');
        if (!memberId) return;
        if (!membersById.has(memberId)) {
          membersById.set(memberId, {
            key: `member-${memberId}`,
            id: memberId,
            username: member?.username || 'unknown',
            realName: member?.realName || '',
            avatarUrl: member?.avatarUrl || '',
            isMutual: Boolean(member?.isMutual),
            circleIndexes: new Set([circleIndex])
          });
        } else {
          const existing = membersById.get(memberId);
          existing.circleIndexes.add(circleIndex);
          existing.isMutual = existing.isMutual || Boolean(member?.isMutual);
        }
      });
    });

    const computedMembers = Array.from(membersById.values()).map((member, index, arr) => {
      if (member.isMutual) {
        mutualTotal += 1;
      }
      const angle = ((Math.PI * 2) / Math.max(arr.length, 1)) * index - (Math.PI / 2);
      return {
        ...member,
        point: polarToCartesian(MEMBER_RADIUS, angle)
      };
    });

    const computedEdges = [];
    computedCircleNodes.forEach((circleNode, circleIndex) => {
      computedEdges.push({
        key: `edge-owner-${circleNode.key}`,
        from: { x: CENTER_X, y: CENTER_Y },
        to: circleNode.point,
        isHighlighted: activeKey === circleNode.key || activeKey === 'owner'
      });
      computedMembers.forEach((member) => {
        if (!member.circleIndexes.has(circleIndex)) return;
        computedEdges.push({
          key: `edge-${circleNode.key}-${member.key}`,
          from: circleNode.point,
          to: member.point,
          isHighlighted: activeKey === circleNode.key || activeKey === member.key
        });
      });
    });

    return {
      circleNodes: computedCircleNodes,
      memberNodes: computedMembers,
      edges: computedEdges,
      mutualCount: mutualTotal
    };
  }, [circles, accentColor, activeKey]);

  if (circleNodes.length === 0) {
    return <p className="rounded-2xl bg-white/55 px-4 py-4 text-sm text-slate-500">No circles available yet.</p>;
  }

  return (
    <div className="space-y-3">
      <p className="text-xs uppercase tracking-wide text-slate-500">
        Spider diagram • {memberNodes.length} members • {mutualCount} mutual
      </p>
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white/80 p-3">
        <svg viewBox="0 0 480 360" className="h-[320px] w-full min-w-[460px]">
          {edges.map((edge) => (
            <line
              key={edge.key}
              x1={edge.from.x}
              y1={edge.from.y}
              x2={edge.to.x}
              y2={edge.to.y}
              stroke={edge.isHighlighted ? accentColor : '#cbd5e1'}
              strokeWidth={edge.isHighlighted ? 2.25 : 1.2}
              opacity={edge.isHighlighted ? 0.95 : 0.55}
            />
          ))}

          <g onMouseEnter={() => setActiveKey('owner')} onMouseLeave={() => setActiveKey('')}>
            <circle cx={CENTER_X} cy={CENTER_Y} r="20" fill={accentColor} />
            <text x={CENTER_X} y={CENTER_Y + 4} textAnchor="middle" className="fill-white text-[10px] font-semibold">You</text>
          </g>

          {circleNodes.map((circle) => (
            <g
              key={circle.key}
              onMouseEnter={() => setActiveKey(circle.key)}
              onMouseLeave={() => setActiveKey('')}
            >
              <circle cx={circle.point.x} cy={circle.point.y} r="16" fill={circle.color} opacity="0.88" />
              <title>{circle.name} ({circle.audience})</title>
              <text x={circle.point.x} y={circle.point.y + 4} textAnchor="middle" className="fill-white text-[9px] font-semibold">
                {circle.name.slice(0, 8)}
              </text>
            </g>
          ))}

          {memberNodes.map((member) => (
            <g
              key={member.key}
              onMouseEnter={() => setActiveKey(member.key)}
              onMouseLeave={() => setActiveKey('')}
              className={member.isMutual ? 'drop-shadow-[0_0_6px_rgba(251,191,36,0.95)]' : ''}
            >
              <circle
                cx={member.point.x}
                cy={member.point.y}
                r={member.isMutual ? 12 : 10}
                fill={member.isMutual ? '#f59e0b' : '#334155'}
                opacity="0.95"
              />
              <title>{member.realName || member.username}{member.isMutual ? ' • Mutual friend' : ''}</title>
              <text x={member.point.x} y={member.point.y + 3} textAnchor="middle" className="fill-white text-[8px] font-semibold">
                {(member.realName || member.username || '?').charAt(0).toUpperCase()}
              </text>
            </g>
          ))}
        </svg>
      </div>
      <p className="text-xs text-slate-500">
        Viewing circles for <span className="font-semibold text-slate-700">@{profileLabel}</span>. Mutual friends glow amber.
      </p>
    </div>
  );
}

export default CircleSpiderDiagram;
