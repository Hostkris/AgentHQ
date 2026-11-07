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
 'The cleaning board suggests an optional 2:30–3 PM reset, while the weekly board assigns that time to rest and 4–4:20 PM to cleaning. Keep 4–4:20 PM primary.',
 'The flip and investment allocations are alternative uses of the same savings above $1,000, not two simultaneously spendable amounts.',
 'The uploaded weekly gym rotation includes Friday. The owner can adjust or skip it.'
];

export const BOARD_CONFIRMED_EATING_RULE='Confirmed by owner: do not eat after 5:00 PM. Weekday dinner is 4:20–4:50 PM before LA Fitness; the 6:30 PM block is for shower, optional sauna and recovery, not food.';
