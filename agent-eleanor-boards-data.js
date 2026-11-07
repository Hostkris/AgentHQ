// Board titles are public. Personal financial figures and schedules are PRIVATE in
// public.agent_hq_board_snapshots, with enforced owner-only row-level security.
export const BOARD_KEYS=['financial','flip','investment','cleaning','weekly'];
export const BOARD_LABELS={
 financial:'Monthly Financial Board',
 flip:'Side Money Flip Board',
 investment:'Saved Money Investment Board',
 cleaning:'The Cleaning Schedule',
 weekly:'The Weekly Organization Board'
};
export const BOARD_COLOR={
 financial:'financial',flip:'financial',investment:'financial',
 cleaning:'home',weekly:'home'
};
export const BOARD_CONFLICT_LABELS=[
 'The weekly board places dinner after 6:30 PM but an earlier 5 PM eating-cutoff reminder remains active. Eleanor should seek a decision instead of changing either silently.',
 'The cleaning board suggests an optional 2:30–3 PM reset, while the weekly board assigns that time to rest and 4–4:20 PM to cleaning. Keep 4–4:20 PM primary.',
 'The flip and investment allocations are alternative uses of the same savings above $1,000, not two simultaneously spendable amounts.',
 'The uploaded weekly gym rotation includes Friday. The owner can adjust or skip it.'
];
