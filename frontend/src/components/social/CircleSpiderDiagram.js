import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

const CENTER_X = 280;
const CENTER_Y = 210;
const CIRCLE_RADIUS = 110;
const MEMBER_RADIUS = 190;

const isRenderableAvatar = (value = '') => {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

const polarToCartesian = (radius, angleRadians) => ({
  x: CENTER_X + (radius * Math.cos(angleRadians)),
  y: CENTER_Y + (radius * Math.sin(angleRadians))
});

function CircleSpiderDiagram({ circles = [], profileLabel = 'User', accentColor = '#3B82F6' }) {
  const [activeKey, setActiveKey] = useState('');
  const [selectedItem, setSelectedItem] = useState(null);
  const ownerLabel = String(profileLabel || 'User').replace(/^@/, '') || 'User';

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

  const handleSelectCircle = (circle) => {
    setSelectedItem({
      type: 'circle',
      name: circle.name,
      avatarUrl: circle.profileImageUrl,
      subtitle: circle.audience === 'secure' ? 'Secure circle' : 'Social circle',
      username: null
    });
  };

  const handleSelectMember = (member) => {
    setSelectedItem({
      type: 'member',
      name: member.realName || member.username,
      avatarUrl: member.avatarUrl || '',
      subtitle: member.isMutual ? `@${member.username} • Mutual friend` : `@${member.username}`,
      username: member.username
    });
  };

  return (
    <div className="space-y-3">
      <p className="text-xs uppercase tracking-wide text-slate-500">
        Circle web • {memberNodes.length} members • {mutualCount} mutual
      </p>
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-violet-50/30 to-sky-50/40 p-3 shadow-sm">
        <svg viewBox="0 0 560 420" className="h-[360px] w-full min-w-[480px]">
          <defs>
            <radialGradient id="csd-owner-grad" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={accentColor} stopOpacity="1" />
              <stop offset="100%" stopColor={accentColor} stopOpacity="0.7" />
            </radialGradient>
            {circleNodes.map((circle) => (
              <clipPath key={`clip-${circle.key}`} id={`clip-${circle.key}`}>
                <circle cx={circle.point.x} cy={circle.point.y} r="18" />
              </clipPath>
            ))}
            {memberNodes.map((member) => (
              <clipPath key={`clip-${member.key}`} id={`clip-${member.key}`}>
                <circle cx={member.point.x} cy={member.point.y} r={member.isMutual ? 13 : 11} />
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
              strokeWidth={edge.isHighlighted ? 2.5 : 1.2}
              opacity={edge.isHighlighted ? 0.9 : 0.45}
              strokeDasharray={edge.isHighlighted ? 'none' : '4 3'}
            />
          ))}

          <g
            onMouseEnter={() => setActiveKey('owner')}
            onMouseLeave={() => setActiveKey('')}
            style={{ cursor: 'default' }}
          >
            <circle cx={CENTER_X} cy={CENTER_Y} r="26" fill="url(#csd-owner-grad)" opacity="0.15" />
            <circle cx={CENTER_X} cy={CENTER_Y} r="22" fill="url(#csd-owner-grad)" />
            <text x={CENTER_X} y={CENTER_Y + 5} textAnchor="middle" style={{ fill: 'white', fontSize: '10px', fontWeight: '700', fontFamily: 'inherit' }}>
              {ownerLabel.slice(0, 6)}
            </text>
          </g>

          {circleNodes.map((circle) => (
            <g
              key={circle.key}
              data-testid={`circle-web-circle-${circle.name}`}
              onMouseEnter={() => setActiveKey(circle.key)}
              onMouseLeave={() => setActiveKey('')}
              onClick={() => handleSelectCircle(circle)}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  handleSelectCircle(circle);
                }
              }}
              style={{ cursor: 'pointer' }}
            >
              <circle
                cx={circle.point.x}
                cy={circle.point.y}
                r="22"
                fill={circle.color}
                opacity={activeKey === circle.key ? 1 : 0.85}
              />
              <circle
                cx={circle.point.x}
                cy={circle.point.y}
                r="22"
                fill="none"
                stroke={circle.audience === 'secure' ? '#f59e0b' : '#c7d2fe'}
                strokeWidth={activeKey === circle.key ? 2.5 : 1.5}
                opacity={activeKey === circle.key ? 1 : 0.7}
              />
              {isRenderableAvatar(circle.profileImageUrl) ? (
                <image
                  href={circle.profileImageUrl}
                  x={circle.point.x - 18}
                  y={circle.point.y - 18}
                  width="36"
                  height="36"
                  preserveAspectRatio="xMidYMid slice"
                  clipPath={`url(#clip-${circle.key})`}
                />
              ) : null}
              <title>{circle.name} ({circle.audience})</title>
              <text x={circle.point.x} y={circle.point.y + 4} textAnchor="middle" style={{ fill: 'white', fontSize: '9px', fontWeight: '600', fontFamily: 'inherit' }}>
                {circle.name.slice(0, 9)}
              </text>
            </g>
          ))}

          {memberNodes.map((member) => (
            <g
              key={member.key}
              data-testid={`circle-web-member-${member.id}`}
              onMouseEnter={() => setActiveKey(member.key)}
              onMouseLeave={() => setActiveKey('')}
              onClick={() => handleSelectMember(member)}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  handleSelectMember(member);
                }
              }}
              style={{ cursor: 'pointer', filter: member.isMutual ? 'drop-shadow(0 0 6px rgba(251,191,36,0.9))' : 'none' }}
            >
              <circle
                cx={member.point.x}
                cy={member.point.y}
                r={member.isMutual ? 15 : 13}
                fill={member.isMutual ? '#f59e0b' : '#475569'}
                opacity={activeKey === member.key ? 1 : 0.9}
              />
              {isRenderableAvatar(member.avatarUrl) ? (
                <image
                  href={member.avatarUrl}
                  x={member.point.x - (member.isMutual ? 13 : 11)}
                  y={member.point.y - (member.isMutual ? 13 : 11)}
                  width={member.isMutual ? 26 : 22}
                  height={member.isMutual ? 26 : 22}
                  preserveAspectRatio="xMidYMid slice"
                  clipPath={`url(#clip-${member.key})`}
                />
              ) : (
                <text x={member.point.x} y={member.point.y + 4} textAnchor="middle" style={{ fill: 'white', fontSize: '8px', fontWeight: '700', fontFamily: 'inherit' }}>
                  {(member.realName || member.username || '?').charAt(0).toUpperCase()}
                </text>
              )}
              <title>{member.realName || member.username}{member.isMutual ? ' • Mutual friend' : ''}</title>
            </g>
          ))}
        </svg>
      </div>

      {selectedItem ? (
        <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white/95 px-4 py-3 shadow-md">
          {isRenderableAvatar(selectedItem.avatarUrl) ? (
            <img src={selectedItem.avatarUrl} alt="" className="h-11 w-11 flex-shrink-0 rounded-full object-cover ring-2 ring-violet-200" />
          ) : (
            <span className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-full bg-violet-100 text-base font-bold text-violet-700 ring-2 ring-violet-200">
              {selectedItem.name.charAt(0).toUpperCase()}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-slate-900">{selectedItem.name}</p>
            <p className="truncate text-xs text-slate-500">{selectedItem.subtitle}</p>
            {selectedItem.type === 'member' && selectedItem.username ? (
              <Link
                to={`/social?user=${encodeURIComponent(selectedItem.username)}`}
                onClick={() => setSelectedItem(null)}
                className="mt-1.5 inline-block rounded-lg bg-violet-600 px-3 py-1 text-xs font-semibold text-white hover:bg-violet-700"
              >
                View Full Profile
              </Link>
            ) : null}
          </div>
          <button type="button" onClick={() => setSelectedItem(null)} className="flex-shrink-0 rounded-full p-1 text-xs text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            ✕
          </button>
        </div>
      ) : null}

      <p className="text-xs text-slate-500">
        Viewing circles for <span className="font-semibold text-slate-700">@{profileLabel}</span>. Click or press Enter/Space on nodes to view details.
      </p>
    </div>
  );
}

export default CircleSpiderDiagram;
