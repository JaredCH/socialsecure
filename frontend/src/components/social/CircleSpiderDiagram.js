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
  const [selectedItem, setSelectedItem] = useState(null);
  const ownerLabel = String(profileLabel || 'User').replace(/^@/, '').slice(0, 8) || 'User';

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
        profileImageUrl: circle.profileImageUrl || '',
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
        Circle web • {memberNodes.length} members • {mutualCount} mutual
      </p>
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white/80 p-3">
        <svg viewBox="0 0 480 360" className="h-[320px] w-full min-w-[460px]">
          <defs>
            {circleNodes.map((circle) => (
              <clipPath key={`clip-${circle.key}`} id={`clip-${circle.key}`}>
                <circle cx={circle.point.x} cy={circle.point.y} r="16" />
              </clipPath>
            ))}
          </defs>
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
            <text x={CENTER_X} y={CENTER_Y + 4} textAnchor="middle" className="fill-white text-[10px] font-semibold">{ownerLabel}</text>
          </g>

          {circleNodes.map((circle) => (
            <g
              key={circle.key}
              data-testid={`circle-web-circle-${circle.name}`}
              onMouseEnter={() => setActiveKey(circle.key)}
              onMouseLeave={() => setActiveKey('')}
              onClick={() => setSelectedItem({
                type: 'circle',
                name: circle.name,
                avatarUrl: circle.profileImageUrl,
                subtitle: circle.audience === 'secure' ? 'Secure circle' : 'Social circle'
              })}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  setSelectedItem({
                    type: 'circle',
                    name: circle.name,
                    avatarUrl: circle.profileImageUrl,
                    subtitle: circle.audience === 'secure' ? 'Secure circle' : 'Social circle'
                  });
                }
              }}
            >
              <circle cx={circle.point.x} cy={circle.point.y} r="16" fill={circle.color} opacity="0.88" />
              {circle.profileImageUrl ? (
                <image
                  href={circle.profileImageUrl}
                  x={circle.point.x - 16}
                  y={circle.point.y - 16}
                  width="32"
                  height="32"
                  preserveAspectRatio="xMidYMid slice"
                  clipPath={`url(#clip-${circle.key})`}
                />
              ) : null}
              <title>{circle.name} ({circle.audience})</title>
              <text x={circle.point.x} y={circle.point.y + 4} textAnchor="middle" className="fill-white text-[9px] font-semibold">
                {circle.name.slice(0, 8)}
              </text>
            </g>
          ))}

          {memberNodes.map((member) => (
            <g
              key={member.key}
              data-testid={`circle-web-member-${member.id}`}
              onMouseEnter={() => setActiveKey(member.key)}
              onMouseLeave={() => setActiveKey('')}
              className={member.isMutual ? 'drop-shadow-[0_0_6px_rgba(251,191,36,0.95)]' : ''}
              onClick={() => setSelectedItem({
                type: 'member',
                name: member.realName || member.username,
                avatarUrl: member.avatarUrl || '',
                subtitle: member.isMutual ? `@${member.username} • Mutual friend` : `@${member.username}`
              })}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  setSelectedItem({
                    type: 'member',
                    name: member.realName || member.username,
                    avatarUrl: member.avatarUrl || '',
                    subtitle: member.isMutual ? `@${member.username} • Mutual friend` : `@${member.username}`
                  });
                }
              }}
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
      {selectedItem ? (
        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white/90 px-3 py-2 text-sm text-slate-700">
          {selectedItem.avatarUrl ? (
            <img src={selectedItem.avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
          ) : (
            <span className="grid h-8 w-8 place-items-center rounded-full bg-slate-200 text-xs font-semibold text-slate-600">
              {selectedItem.name.charAt(0).toUpperCase()}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-slate-900">{selectedItem.name}</p>
            <p className="truncate text-xs text-slate-500">{selectedItem.subtitle}</p>
          </div>
          <button type="button" onClick={() => setSelectedItem(null)} className="rounded-full px-2 py-1 text-xs text-slate-500 hover:bg-slate-100">
            Close
          </button>
        </div>
      ) : null}
      <p className="text-xs text-slate-500">
        Viewing circles for <span className="font-semibold text-slate-700">@{profileLabel}</span>. Hover for links, click or press Enter/Space on nodes for quick identity cards.
      </p>
    </div>
  );
}

export default CircleSpiderDiagram;
