// Tests the shared action-plan engine (src/actionPlans.js).
//
// This is the code that turns "follow up with these people" into her actual
// daily call list, so the failure modes that matter are: wrong due dates,
// duplicate tasks piling up until she stops trusting the queue, and crashes on
// the messy leads a 6,000-row FUB export is full of.
//
// Run: node scripts/test-action-plans.js
const path = require('path');
const { pathToFileURL } = require('url');

(async () => {
  const m = await import(pathToFileURL(path.join(__dirname, '..', 'src', 'actionPlans.js')).href);
  const {
    addDaysISO, firstNameOf, fillPlaceholders, isOnPlan,
    planTasksForLead, previewBulkApply, buildBulkTasks,
    BUILT_IN_PLANS, MAX_BULK_TASKS,
  } = m;

  let pass = 0, fail = 0;
  const check = (label, actual, expected) => {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
    if (!ok) console.log(`      got=${JSON.stringify(actual)}\n      want=${JSON.stringify(expected)}`);
    ok ? pass++ : fail++;
  };

  let n = 0;
  const idFn = () => `id${++n}`;

  // ── Dates ──────────────────────────────────────────────────────────────────
  check('day 0 is the start date', addDaysISO('2026-09-01', 0), '2026-09-01');
  check('day 7 crosses nothing', addDaysISO('2026-09-01', 7), '2026-09-08');
  check('crosses a month end', addDaysISO('2026-09-28', 7), '2026-10-05');
  check('crosses a year end', addDaysISO('2026-12-30', 7), '2027-01-06');
  check('365-day past-client step lands right', addDaysISO('2026-09-01', 365), '2027-09-01');
  // Leap year — 2028 has a Feb 29. An off-by-one here would shift every
  // downstream task in a 6-month nurture plan.
  check('handles leap day', addDaysISO('2028-02-28', 1), '2028-02-29');
  check('bad date returns null, not "Invalid Date"', addDaysISO('not-a-date', 3), null);
  check('missing date returns null', addDaysISO(undefined, 3), null);

  // ── Names: the crash that was waiting in every copy of this code ───────────
  check('normal name', firstNameOf({ name: 'Gerald Hill' }), 'Gerald');
  check('single name', firstNameOf({ name: 'Cher' }), 'Cher');
  check('extra whitespace', firstNameOf({ name: '  Mary  Beth Smith ' }), 'Mary');
  check('empty name -> "there"', firstNameOf({ name: '' }), 'there');
  check('null name -> "there" (does not throw)', firstNameOf({ name: null }), 'there');
  check('no lead at all -> "there"', firstNameOf(undefined), 'there');

  check('placeholder filled',
    fillPlaceholders('Hi [name], quick question', { name: 'Gerald Hill' }),
    'Hi Gerald, quick question');
  // The old .replace("[name]") only substituted the first one, leaving a
  // literal "[name]" sitting in the middle of a script she reads aloud.
  check('every placeholder filled, not just the first',
    fillPlaceholders('Hi [name] — [name], are you still looking?', { name: 'Gerald Hill' }),
    'Hi Gerald — Gerald, are you still looking?');
  check('{firstName} style also filled',
    fillPlaceholders('Hey {firstName}!', { name: 'Ann Lee' }), 'Hey Ann!');
  check('nameless lead reads naturally',
    fillPlaceholders('Hi [name]!', { name: '' }), 'Hi there!');

  // ── Single-lead application ────────────────────────────────────────────────
  const plan = BUILT_IN_PLANS.find(p => p.id === 'plan_new_lead');
  const lead = { id: 'L1', name: 'Gerald Hill' };
  const tasks = planTasksForLead(plan, lead, '2026-09-01', idFn);
  check('one task per step', tasks.length, plan.steps.length);
  check('first task due on start date', tasks[0].dueDate, '2026-09-01');
  check('last task due day 7', tasks[tasks.length - 1].dueDate, '2026-09-08');
  check('task carries lead id', tasks[0].leadId, 'L1');
  check('task carries plan id for dedupe', tasks[0].actionPlanId, 'plan_new_lead');
  check('tasks start incomplete', tasks.every(t => t.completed === false), true);
  check('every task got a due date', tasks.every(t => !!t.dueDate), true);
  check('text step is personalised', tasks[1].title.includes('Hi Gerald!'), true);

  // A nameless lead must produce a usable task, not an exception.
  let crashed = false;
  let nameless = [];
  try { nameless = planTasksForLead(plan, { id: 'L2', name: null }, '2026-09-01', idFn); }
  catch { crashed = true; }
  check('nameless lead does not crash', crashed, false);
  check('nameless lead still gets all steps', nameless.length, plan.steps.length);
  check('nameless lead labelled for the task list', nameless[0].leadName, '(no name)');

  // ── Duplicate protection ───────────────────────────────────────────────────
  const existing = [
    { leadId: 'L1', actionPlanId: 'plan_new_lead', completed: false },
    { leadId: 'L3', actionPlanId: 'plan_new_lead', completed: true },
  ];
  check('lead with open plan tasks is on the plan', isOnPlan(existing, 'L1', 'plan_new_lead'), true);
  // Finished the plan a year ago -> allowed to run it again. This is exactly
  // the past-client annual check-in coming back around.
  check('lead who FINISHED the plan can be re-enrolled', isOnPlan(existing, 'L3', 'plan_new_lead'), false);
  check('untouched lead is not on the plan', isOnPlan(existing, 'L9', 'plan_new_lead'), false);
  check('different plan does not block', isOnPlan(existing, 'L1', 'plan_buyer'), false);
  check('empty task list is safe', isOnPlan(null, 'L1', 'plan_new_lead'), false);

  // ── Bulk preview ───────────────────────────────────────────────────────────
  const selected = [
    { id: 'L1', name: 'Gerald Hill' },   // already mid-plan -> skipped
    { id: 'L3', name: 'Ann Lee' },       // completed it -> eligible again
    { id: 'L4', name: '' },              // nameless -> eligible
  ];
  const pv = previewBulkApply(plan, selected, existing, '2026-09-01');
  check('preview: eligible count', pv.eligible.length, 2);
  check('preview: skipped count', pv.skipped.length, 1);
  check('preview: skipped is the right lead', pv.skipped[0].id, 'L1');
  check('preview: task count = leads x steps', pv.taskCount, 2 * plan.steps.length);
  check('preview: under cap', pv.overCap, false);
  check('preview: start date valid', pv.validStart, true);
  check('preview: bad start date flagged', previewBulkApply(plan, selected, existing, '').validStart, false);

  // The point of the cap: 6,042 leads x 7 steps = 42,294 tasks would blow past
  // the ~5MB localStorage limit, and a failed write there can take the whole
  // task list with it. Refuse, and say how many she CAN do.
  const many = Array.from({ length: 6042 }, (_, i) => ({ id: `B${i}`, name: `Lead ${i}` }));
  const bigPv = previewBulkApply(plan, many, [], '2026-09-01');
  check('cap: 6,042 leads is over the limit', bigPv.overCap, true);
  check('cap: would have been 42,294 tasks', bigPv.taskCount, 42294);
  check('cap: tells her the max leads that fit', bigPv.maxLeads, Math.floor(MAX_BULK_TASKS / plan.steps.length));
  check('cap: that many leads is under the limit',
    previewBulkApply(plan, many.slice(0, bigPv.maxLeads), [], '2026-09-01').overCap, false);
  // One more lead than the max must trip the cap — off-by-one at the boundary
  // is exactly where a "safe" limit stops being safe.
  check('cap: one over the max trips it',
    previewBulkApply(plan, many.slice(0, bigPv.maxLeads + 1), [], '2026-09-01').overCap, true);

  // ── Commit ─────────────────────────────────────────────────────────────────
  const built = buildBulkTasks(plan, pv.eligible, '2026-09-01', idFn);
  check('commit: builds tasks for every eligible lead', built.length, pv.taskCount);
  check('commit: ids are unique', new Set(built.map(t => t.id)).size, built.length);
  check('commit: does not touch the skipped lead', built.some(t => t.leadId === 'L1'), false);
  check('commit: nameless lead got a real script line',
    built.filter(t => t.leadId === 'L4')[1].title.includes('Hi there!'), true);

  // Every built-in plan must be internally sane — a bad step type would render
  // an uncoloured, unlabelled task.
  const types = new Set(m.TASK_TYPES);
  const badSteps = BUILT_IN_PLANS.flatMap(p =>
    p.steps.filter(s => !types.has(s.type) || typeof s.day !== 'number' || s.day < 0)
      .map(s => `${p.id}:${s.type}:${s.day}`));
  check('all built-in plan steps are valid', badSteps, []);
  check('all built-in plans have unique ids',
    new Set(BUILT_IN_PLANS.map(p => p.id)).size, BUILT_IN_PLANS.length);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
