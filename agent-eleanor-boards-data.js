// Exact user-supplied five-board planning reference, transcribed from November 2026 images.
// Do not treat the figures as live bank balances, actual profits, approved transactions or a new prescription.
// Keep contradictory commitments visible for user reconciliation; Saturday remains protected.
export const BOARD_VERSION='2026-11-07-user-supplied';
export const FINANCIAL_BOARD=Object.freeze({
 title:'Monthly Financial Board',subtitle:'Income, Bills, and Savings Snapshot',
 bills:[
  ['Entertainment',111.97],['Phone',107.26],['Internet',115],['Food',540],
  ['AEP',300],['WTR',83.33],['Misc',300]
 ],
 food_range:'$120.00 / $150.00 × 4',bills_total:1557.56,
 paychecks:[['Marshalls','$371.95 / $743.90'],['AutoZone','$757.59']],
 paycheck_total:1501.49,periods:2,monthly_income:3002.98,
 saved_range:[1345.42,1745.42],left_after_bills:1445.42,bills_percent:51.9,remaining_percent:48.1,
 focus:['Watch Food spending closely.','Keep Misc category disciplined.','Build savings upward from the current range.'],
 sources:'Owner-provided planning snapshot, not bank-synced balances. Food is $120–$150/week; the pictured $1,557.56 monthly bill total implies $540 in the food line ($135/week).'
});
export const FLIP_BOARD=Object.freeze({
 title:'Side Money Flip Board',subtitle:'Keep $1,000 Liquid • Put the Extra to Faster-Turn Opportunities',
 saved_range:[1345.42,1745.42],liquid_floor:1000,working_capital_range:[345.42,745.42],
 vehicles:[
  ['Reselling Inventory','Buy low, resell for quick margins'],
  ['Retail Arbitrage','Source discounted items and flip online'],
  ['Local Service Setup','Detailing, power washing, or yard cleanup'],
  ['Digital Products','Templates, guides, printables, simple downloads'],
  ['Marketplace Flips','Furniture, tools, and electronics from local deals']
 ],
 source_from:['Costco',"Sam's Club",'Ross','Burlington','Marshalls','Home Depot','Harbor Freight'],
 sell_on:['eBay','Facebook Marketplace','Mercari','Poshmark','OfferUp','Etsy','Gumroad'],
 use_for_tools:['Amazon','Walmart','Canva','Shopify'],
 allocations:[['Reselling Inventory',40],['Local Service Supplies',25],['Digital Product Setup',20],['Opportunity Cash Float',15]],
 scenarios:[
  {name:'Scenario A — Lower Working Capital',saved:1345.42,keep:1000,deploy:345.42,shares:[138.17,86.36,69.08,51.81],illustrative_profit_range:[100,300]},
  {name:'Scenario B — Higher Working Capital',saved:1745.42,keep:1000,deploy:745.42,shares:[298.17,186.36,149.08,111.81],illustrative_profit_range:[250,600]}
 ],
 focus:['Protect the $1,000 floor','Choose repeatable flips','Scale with profits, not with debt'],
 caveat:'Possible profit ranges are aspirational screenshot scenarios, not verified, forecast or guaranteed income. Any real spending requires confirmation of current cash, unpaid bills and owner approval.'
});
export const INVESTMENT_BOARD=Object.freeze({
 title:'Saved Money Investment Board',subtitle:'Keeping $1,000 Saved • Investing the Rest',
 saved_range:[1345.42,1745.42],liquid_floor:1000,investable_range:[345.42,745.42],
 vehicles:[
  ['High-Yield Savings / Money Market','$1,000 kept liquid for safety'],
  ['Broad Market ETF','Core growth'],['Dividend ETF','Income and reinvestment'],
  ['Bond ETF / Treasury Fund','Stability and lower volatility'],['REIT ETF','Real estate exposure']
 ],
 allocations:[['Broad Market ETF',40],['Dividend ETF',25],['Bond ETF / Treasury Fund',20],['REIT ETF',15]],
 scenarios:[
  {name:'Scenario A — Lower Saved Amount',saved:1345.42,keep:1000,deploy:345.42,shares:[138.17,86.36,69.08,51.81]},
  {name:'Scenario B — Higher Saved Amount',saved:1745.42,keep:1000,deploy:745.42,shares:[298.17,186.36,149.08,111.81]}
 ],
 focus:['Keep the $1,000 floor intact','Automate contributions after approval','Reinvest dividends and stay consistent'],
 caveat:'Example allocation, not an executed investment plan. It uses the same $345.42–$745.42 overflow as the Side Money Flip Board; do not deploy those dollars to both plans simultaneously. Investment risk and cash obligations require review.'
});
export const CLEANING_BOARD=Object.freeze({
 title:'The Cleaning Schedule',subtitle:'A Clean Home / A Calm Mind / More Time / A Better You',
 daily_reset_minutes:20,
 daily_reset:['Dishes (load/unload)','Take out trash (if needed)','Wipe kitchen counters',
  'Wipe sinks (kitchen & bathroom)','Quick sweep high-traffic floors','Put items away','Quick tidy (living room / main areas)'],
 best_times:[
  ['2:30–3:00 PM','Quick reset (daily 20 minutes); alternate if not working late'],
  ['Before gym (after reset)','Get home ready'],
  ['After dinner (6:30–7:00 PM)','Finish small tasks / put away; conflicts with owner 5 PM food cutoff'],
  ['As needed (evenings)','Extra cleaning or organizing']
 ],
 days:[
  {dow:1,day:'Monday',title:'Bathroom + Sinks',items:['Clean toilet','Clean shower/tub','Wipe bathroom sinks','Clean mirrors','Restock essentials','Take out bathroom trash','Mop bathroom floor']},
  {dow:2,day:'Tuesday',title:'Floors',items:['Sweep all main floors','Mop hard floors','Vacuum carpets/rugs','Wipe baseboards','Check entryway','Clean under furniture','Spot clean walls/doors']},
  {dow:3,day:'Wednesday',title:'Bedrooms + Linens',items:['Change bed sheets','Make all beds','Wash dirty linens','Declutter dressers','Put clothes away','Organize closets','Dust bedroom surfaces']},
  {dow:4,day:'Thursday',title:'Declutter + Organize',items:['Put everything away','Declutter surfaces','Organize living room','Organize kitchen items','Sort mail and papers','Check storage areas','Wipe doors & handles']},
  {dow:5,day:'Friday',title:'Kitchen + Final Reset',items:['Clean stove/oven (spot)','Wipe fridge (outside)','Clean microwave','Wipe cabinets (outside)','Clean counters','Take out all trash','Final house reset']},
  {dow:6,day:'Saturday',title:'Sabbath — No Cleaning',items:['REST','FAMILY','FAITH','RELAX','NO CLEANING']},
  {dow:0,day:'Sunday',title:'Light Day / Extras',items:['Light cleaning (as needed)','Laundry prep','Put away items','Check for missed tasks','Prepare for next week','Organize goals/plans','Free time / leisure']}
 ],
 zones:[['Zone 1','Kitchen + Dining'],['Zone 2','Living Room + Entry'],['Zone 3','Bathrooms'],
  ['Zone 4','Bedrooms'],['Zone 5','Laundry + Storage'],['Zone 6','Floors (whole house)']],
 supplies:['All-purpose cleaner','Disinfectant spray','Glass cleaner','Bathroom cleaner','Floor cleaner (mop)',
  'Broom / dustpan','Vacuum','Mop + bucket','Microfiber cloths','Paper towels','Trash bags','Sponges / scrub brush','Laundry detergent','Room freshener (optional)'],
 tips:['Set a 20-minute timer and focus','Do one area each day','Keep frequently used items easily accessible',
  'Put items away immediately','Take out trash before it gets full','Keep Saturday as a day of rest']
});
export const WEEKLY_BOARD=Object.freeze({
 title:'The Weekly Organization Board',subtitle:'Work / Fitness / Business (Sales Focused) / Learning / Home / Recovery',
 rhythm:[
  ['06:30','08:15','Morning routine + commute',false],
  ['08:15','14:30','Work (sometimes until 3 PM)',false],
  ['14:30','15:00','Snack, reset, actual downtime',true],
  ['15:00','16:00','Business (sales focused — weekday rotation)',false],
  ['16:00','16:20','Quick home cleaning reset',false],
  ['17:00','18:30','LA Fitness (90-minute plan)',false],
  ['18:30','19:20','Shower, sauna (optional), dinner (dinner conflicts with 5 PM cutoff)',true],
  ['19:20','19:40','Math practice (20 minutes)',false],
  ['19:40','20:05','Reading (25 minutes)',false],
  ['20:05','20:20','Optional ChatGPT wrap-up + tomorrow',true],
  ['20:20',null,'Family, personal time, sleep routine',false]
 ],
 business_days:[
  {dow:1,day:'Monday',title:'Arbitrage',description:'Research, compare prices, calculate margins, list 1–2 items'},
  {dow:2,day:'Tuesday',title:'Shopify Skincare',description:'Create ad creative, improve product page, make short video'},
  {dow:3,day:'Wednesday',title:'ChatGPT Content',description:'Draft hooks, create posts, coding and projects, plan promotions'},
  {dow:4,day:'Thursday',title:'Arbitrage',description:'Photograph and list items, manage inventory, answer buyers'},
  {dow:5,day:'Friday',title:'Shopify Skincare',description:'Launch owner-approved ads, publish owner-approved product videos, answer inquiries, check analytics'}
 ],
 gym_days:[
  {dow:1,day:'Monday',details:'Walk + push-ups / leg press'},
  {dow:2,day:'Tuesday',details:'Racquetball + seated row / pulldown'},
  {dow:3,day:'Wednesday',details:'Recovery walk, mobility, easy weights'},
  {dow:4,day:'Thursday',details:'Walk + push-ups / back + leg press'},
  {dow:5,day:'Friday',details:'Racquetball + machine circuit / stretch'}
 ],
 gym_notes:['Warm up and cool down every visit','Sauna optional 10 min, 2–3 visits/week',
  'Push-up math: 10 push-ups after every 2 laps; 8 rounds = 80 push-ups and 16 laps; 10 rounds = 100 and 20 laps. Build gradually.'],
 home_reset:[
  ['Daily','Dishes, trash, counters + items away'],
  ['Monday','Bathroom + sink wipe-down'],['Tuesday','Mop / sweep main floors'],
  ['Wednesday','Beds, linens + bedrooms'],['Thursday','Declutter + put everything away'],
  ['Friday','Final kitchen + house reset']
 ],
 weekend:{
  saturday:['SABBATH / COMPLETE REST','No business blocks','No gym','Rest, faith, family and genuine downtime'],
  sunday:['30 min: weekly planning + priorities','30–60 min: TikTok Live (optional)',
   '30–45 min: light chores OR business (optional)','Free time / leisure']
 },
 sales_target_net_monthly:300,
 tips:['Keep Saturday completely free','If work runs until 3 PM, cut focus block to 15–25 minutes; protect gym, recovery and sleep',
  'First $300/month net profit is a goal, not guaranteed results']
});
export const BOARD_CONFLICTS=Object.freeze([
 'The weekly rhythm lists dinner at 6:30–7:20 PM, while the earlier 5 PM eating-cutoff reminder is still active. Eleanor must ask which instruction to follow instead of assuming an exception.',
 'The cleaning board offers a 2:30–3:00 PM reset; the weekly organization board assigns that time to downtime and moves the home reset to 4:00–4:20 PM. Use the latter as the primary reminder, retain the former as an optional alternative.',
 'The investment and flip boards reuse the same post-$1,000 overflow. Treat them as alternatives unless the user specifies a split. No double counting or automatic money moves.',
 'The gym board has Monday–Friday sessions, including Friday, whereas earlier preferences may have excluded Friday. Preserve the uploaded schedule as a proposed plan and do not misrepresent completion.'
]);
