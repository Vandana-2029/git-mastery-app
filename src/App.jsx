import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Terminal,
  GitBranch,
  GitCommit,
  GitMerge,
  GitPullRequest,
  BookOpen,
  Award,
  Flame,
  Zap,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  RefreshCw,
  RotateCcw,
  Play,
  ChevronRight,
  Code2,
  Sparkles,
  Layers,
  ArrowRight,
  Bookmark
} from 'lucide-react';

// --- INITIAL LESSON CURRICULUM ---
const CURRICULUM = [
  {
    id: 1,
    title: '1. First Commit',
    category: 'Git Basics',
    description: 'Learn how to create a commit snapshot in Git. Commits represent permanent checkpoints in your repository history.',
    theory: 'In Git, a commit records changes to a repository. Each commit contains an author, timestamp, commit message, and a pointer to its parent commit.',
    task: 'Create a new commit with the message "my first commit".',
    targetCommand: 'git commit -m "my first commit"',
    check: (state) => Object.keys(state.commits).length >= 2,
    hint: 'Type: git commit -m "my first commit" and press Enter.'
  },
  {
    id: 2,
    title: '2. Branching Out',
    category: 'Branching',
    description: 'Branches allow you to diverge from the production line of development and work isolated without messing up existing code.',
    theory: 'A branch in Git is simply a lightweight movable pointer to one of these commits. Creating a branch does not duplicate files.',
    task: 'Create a new branch named "feature".',
    targetCommand: 'git branch feature',
    check: (state) => 'feature' in state.branches,
    hint: 'Type: git branch feature'
  },
  {
    id: 3,
    title: '3. Switching Branches',
    category: 'Branching',
    description: 'Move your working pointer (HEAD) onto a different branch to record upcoming commits there.',
    theory: 'HEAD is the symbolic name for currently checked out commit/branch. Switching updates HEAD.',
    task: 'Switch to the "feature" branch.',
    targetCommand: 'git checkout feature',
    check: (state) => state.HEAD === 'feature',
    hint: 'Type: git checkout feature or git switch feature'
  },
  {
    id: 4,
    title: '4. Committing on Feature',
    category: 'Branching',
    description: 'Add isolated work directly onto the feature branch.',
    theory: 'When HEAD points to feature, any new commit will automatically advance the feature pointer while main stays behind.',
    task: 'Make a commit on feature branch: "add login feature".',
    targetCommand: 'git commit -m "add login feature"',
    check: (state) => {
      const featureCommit = state.commits[state.branches['feature']];
      return Boolean(featureCommit && featureCommit.branchHint === 'feature' && featureCommit.parents.length > 0);
    },
    hint: 'Type: git commit -m "add login feature"'
  },
  {
    id: 5,
    title: '5. Fast-Forward / Merge',
    category: 'Merging',
    description: 'Integrate the work from feature branch back into main.',
    theory: 'A fast-forward merge simply moves the main pointer forward to match feature because history was linear.',
    task: 'Switch back to main and merge feature.',
    targetCommand: 'git checkout main && git merge feature',
    check: (state) => state.HEAD === 'main' && state.branches['main'] === state.branches['feature'],
    hint: 'First type "git checkout main", then type "git merge feature"'
  },
  {
    id: 6,
    title: '6. Release Tagging',
    category: 'Advanced',
    description: 'Mark release points with semantic version tags.',
    theory: 'Tags are permanent reference pointers often used to represent release versions like v1.0.0.',
    task: 'Create a tag named "v1.0.0" on current commit.',
    targetCommand: 'git tag v1.0.0',
    check: (state) => 'v1.0.0' in state.tags,
    hint: 'Type: git tag v1.0.0'
  }
];

const INITIAL_GIT_STATE = {
  commits: {
    'c1': { id: 'c1', message: 'Initial commit', parents: [], branchHint: 'main', timestamp: '12:00' }
  },
  branches: {
    'main': 'c1'
  },
  tags: {},
  HEAD: 'main',
  isDetached: false,
  stash: []
};

// --- GIT GRAPH HELPERS ---
// True if `ancestor` is reachable from `descendant` through any parent link.
function isAncestor(commits, ancestor, descendant) {
  const stack = [descendant];
  const visited = new Set();
  while (stack.length) {
    const c = stack.pop();
    if (!c || visited.has(c)) continue;
    if (c === ancestor) return true;
    visited.add(c);
    stack.push(...(commits[c]?.parents || []));
  }
  return false;
}

function nextCommitId(state) {
  let n = Object.keys(state.commits).length + 1;
  while (state.commits['c' + n]) n++;
  return 'c' + n;
}

function isValidRefName(name) {
  return /^[A-Za-z0-9._/-]+$/.test(name) && !name.startsWith('-') && !name.includes('..') && name.length <= 40;
}

// --- PROGRESS PERSISTENCE (localStorage) ---
const PROGRESS_KEY = 'gitmastery-progress-v1';
const DEFAULT_PROGRESS = { completedLessons: [], xp: 0, streak: 0, lastClaimDate: null, currentLessonId: 1 };

function loadProgress() {
  try {
    const saved = JSON.parse(localStorage.getItem(PROGRESS_KEY));
    return saved ? { ...DEFAULT_PROGRESS, ...saved } : DEFAULT_PROGRESS;
  } catch {
    return DEFAULT_PROGRESS;
  }
}

// Local calendar date (not UTC), so the streak rolls over at the user's midnight.
const dayKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export default function App() {
  const [savedProgress] = useState(loadProgress);
  const [gitState, setGitState] = useState(INITIAL_GIT_STATE);
  const [history, setHistory] = useState([INITIAL_GIT_STATE]);
  const [historyIndex, setHistoryIndex] = useState(0);

  // Terminal state
  const [commandInput, setCommandInput] = useState('');
  const [terminalLogs, setTerminalLogs] = useState([
    { type: 'system', text: '⚡ Welcome to GitMastery CLI & Interactive Graph Playground!' },
    { type: 'system', text: 'Type "git help" or choose a lesson on the left to start.' }
  ]);
  const [cliHistory, setCliHistory] = useState([]);
  const [cliHistoryIndex, setCliHistoryIndex] = useState(-1);

  // Gamification & Progress
  const [currentLessonId, setCurrentLessonId] = useState(savedProgress.currentLessonId);
  const [completedLessons, setCompletedLessons] = useState(savedProgress.completedLessons);
  const [streak, setStreak] = useState(savedProgress.streak);
  const [lastClaimDate, setLastClaimDate] = useState(savedProgress.lastClaimDate);
  const [xp, setXp] = useState(savedProgress.xp);
  const [mode, setMode] = useState('lessons'); // 'lessons' | 'sandbox'
  const streakClaimed = lastClaimDate === dayKey();

  useEffect(() => {
    try {
      localStorage.setItem(PROGRESS_KEY, JSON.stringify({ completedLessons, xp, streak, lastClaimDate, currentLessonId }));
    } catch {
      // Storage unavailable (private mode etc.) - progress just won't persist.
    }
  }, [completedLessons, xp, streak, lastClaimDate, currentLessonId]);

  const terminalEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    // Scroll only the terminal pane; scrollIntoView would also scroll the page on small screens.
    const el = terminalEndRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [terminalLogs]);

  const currentLesson = CURRICULUM.find(l => l.id === currentLessonId) || CURRICULUM[0];
  const progressPercent = Math.round((completedLessons.length / CURRICULUM.length) * 100);

  // Check lesson completion
  useEffect(() => {
    if (mode === 'lessons' && currentLesson && currentLesson.check) {
      if (currentLesson.check(gitState)) {
        if (!completedLessons.includes(currentLesson.id)) {
          setCompletedLessons(prev => [...prev, currentLesson.id]);
          setXp(x => x + 50);
          addLog('success', `🎉 Mission Complete: "${currentLesson.title}"! (+50 XP)`);
        }
      }
    }
  }, [gitState, currentLessonId, mode]);

  const addLog = (type, text) => {
    setTerminalLogs(prev => [...prev, { type, text }]);
  };

  const recordState = (newState) => {
    const updatedHistory = history.slice(0, historyIndex + 1);
    updatedHistory.push(newState);
    setHistory(updatedHistory);
    setHistoryIndex(updatedHistory.length - 1);
    setGitState(newState);
  };

  const handleUndo = () => {
    if (historyIndex > 0) {
      const newIdx = historyIndex - 1;
      setHistoryIndex(newIdx);
      setGitState(history[newIdx]);
      addLog('system', '↺ Reverted to previous state');
    }
  };

  const handleResetRepo = () => {
    setGitState(INITIAL_GIT_STATE);
    setHistory([INITIAL_GIT_STATE]);
    setHistoryIndex(0);
    addLog('system', 'Repository reinitialized to initial commit.');
  };

  const claimStreak = () => {
    if (streakClaimed) {
      addLog('system', 'Already checked in today. Come back tomorrow to keep your streak!');
      return;
    }
    const yesterday = dayKey(new Date(Date.now() - 86400000));
    const continues = lastClaimDate === yesterday;
    setStreak(s => (continues ? s + 1 : 1));
    setXp(x => x + 25);
    setLastClaimDate(dayKey());
    addLog('success', continues ? '🔥 Daily Streak extended! +25 XP' : '🔥 Daily Streak started! +25 XP');
  };

  const handleResetProgress = () => {
    if (!window.confirm('Reset all lesson progress, XP and streak?')) return;
    setCompletedLessons([]);
    setXp(0);
    setStreak(0);
    setLastClaimDate(null);
    setCurrentLessonId(1);
    handleResetRepo();
  };

  const nextLesson = CURRICULUM.find(l => l.id > currentLessonId);
  const isCurrentLessonDone = completedLessons.includes(currentLesson.id);

  // --- GIT COMMAND EXECUTOR ---
  // Supports chaining with "&&": each part runs against the state produced by the
  // previous one, and the final state is recorded once (so Undo reverts the whole chain).
  const executeCommand = (cmdText) => {
    const trimmed = cmdText.trim();
    if (!trimmed) return;

    setCliHistory(prev => [...prev, trimmed]);
    setCliHistoryIndex(-1);
    addLog('input', `$ ${trimmed}`);

    let state = gitState;
    let changed = false;
    for (const part of trimmed.split('&&').map(p => p.trim()).filter(Boolean)) {
      const result = runSingleCommand(part, state);
      if (result === false) break; // stop the chain on error, like a real shell
      if (result) {
        state = result;
        changed = true;
      }
    }
    if (changed) recordState(state);
  };

  // Returns the new state if the command changed it, null if it succeeded without
  // changes, or false if it failed.
  const runSingleCommand = (cmd, state) => {
    if (cmd === 'clear') {
      setTerminalLogs([]);
      return null;
    }

    if (cmd !== 'git' && !cmd.startsWith('git ')) {
      addLog('error', `Unknown command: ${cmd}. Only git commands are supported in this playground.`);
      return false;
    }

    const args = cmd.slice(3).trim().split(/\s+/);
    const subCmd = args[0] || 'help';

    const newState = JSON.parse(JSON.stringify(state));
    const headCommitOf = (s) => (s.isDetached ? s.HEAD : s.branches[s.HEAD]);
    const now = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    switch (subCmd) {
      case 'help':
        addLog('info', 'Available Commands:');
        addLog('info', '  git status                  - Check repository status & HEAD');
        addLog('info', '  git log                     - View commit history');
        addLog('info', '  git branch                  - List branches');
        addLog('info', '  git branch <name>           - Create a new branch');
        addLog('info', '  git branch -d <name>        - Delete a branch');
        addLog('info', '  git checkout <branch/cid>   - Switch branch or commit');
        addLog('info', '  git checkout -b <branch>    - Create & switch to branch');
        addLog('info', '  git switch <branch>         - Switch branches');
        addLog('info', '  git commit -m "<message>"   - Create a new commit snapshot');
        addLog('info', '  git merge <branch>          - Merge target branch into current');
        addLog('info', '  git rebase <branch>         - Rebase current branch on target');
        addLog('info', '  git reset --hard <cid>      - Reset HEAD to given commit');
        addLog('info', '  git tag <tagname>           - Tag current commit');
        addLog('info', '  git stash                   - Stash working directory');
        addLog('info', '  git stash pop               - Restore stashed changes');
        addLog('info', '  clear                       - Clear terminal logs');
        addLog('info', 'Chain commands with &&, e.g. git checkout main && git merge feature');
        return null;

      case 'status': {
        const curTarget = newState.isDetached ? `HEAD detached at ${newState.HEAD}` : `On branch ${newState.HEAD}`;
        addLog('info', curTarget);
        addLog('info', 'Working tree clean, nothing to commit.');
        return null;
      }

      case 'log': {
        const currentCommitId = headCommitOf(newState);
        addLog('info', `=== Commit Log (HEAD -> ${currentCommitId}) ===`);
        let curr = currentCommitId;
        const visited = new Set();
        while (curr && !visited.has(curr)) {
          visited.add(curr);
          const c = newState.commits[curr];
          if (!c) break;
          addLog('info', `commit ${c.id} - ${c.message} (${c.branchHint || 'branch'})`);
          curr = c.parents[0];
        }
        return null;
      }

      case 'branch': {
        const bName = args[1];
        if (!bName) {
          addLog('info', 'Branches:');
          Object.keys(newState.branches).forEach(b => {
            const prefix = (!newState.isDetached && newState.HEAD === b) ? '* ' : '  ';
            addLog('info', `${prefix}${b} -> (${newState.branches[b]})`);
          });
          return null;
        }

        if (bName === '-d' || bName === '-D') {
          const targetDel = args[2];
          if (!targetDel || !newState.branches[targetDel]) {
            addLog('error', `error: branch '${targetDel || ''}' not found.`);
            return false;
          }
          if (!newState.isDetached && newState.HEAD === targetDel) {
            addLog('error', `error: Cannot delete branch '${targetDel}' checked out.`);
            return false;
          }
          delete newState.branches[targetDel];
          addLog('success', `Deleted branch ${targetDel}.`);
          return newState;
        }

        if (!isValidRefName(bName)) {
          addLog('error', `fatal: '${bName}' is not a valid branch name.`);
          return false;
        }
        if (newState.branches[bName]) {
          addLog('error', `fatal: A branch named '${bName}' already exists.`);
          return false;
        }

        const headCommit = headCommitOf(newState);
        newState.branches[bName] = headCommit;
        addLog('success', `Created branch '${bName}' at ${headCommit}`);
        return newState;
      }

      case 'checkout':
      case 'switch': {
        if (args[1] === '-b' || (subCmd === 'switch' && args[1] === '-c')) {
          const newB = args[2];
          if (!newB) {
            addLog('error', `fatal: Missing branch name for ${args[1]}`);
            return false;
          }
          if (!isValidRefName(newB)) {
            addLog('error', `fatal: '${newB}' is not a valid branch name.`);
            return false;
          }
          if (newState.branches[newB]) {
            addLog('error', `fatal: A branch named '${newB}' already exists.`);
            return false;
          }
          newState.branches[newB] = headCommitOf(newState);
          newState.HEAD = newB;
          newState.isDetached = false;
          addLog('success', `Switched to a new branch '${newB}'`);
          return newState;
        }

        const target = args[1];
        if (!target) {
          addLog('error', 'fatal: Specify branch or commit to checkout.');
          return false;
        }

        if (newState.branches[target]) {
          if (!newState.isDetached && newState.HEAD === target) {
            addLog('info', `Already on '${target}'`);
            return null;
          }
          newState.HEAD = target;
          newState.isDetached = false;
          addLog('success', `Switched to branch '${target}'`);
          return newState;
        }
        if (newState.commits[target] && subCmd === 'checkout') {
          newState.HEAD = target;
          newState.isDetached = true;
          addLog('warning', `Note: switching to '${target}'. You are in 'detached HEAD' state.`);
          return newState;
        }
        addLog('error', `error: pathspec '${target}' did not match any file(s) / branch / commit known to git`);
        return false;
      }

      case 'commit': {
        // Accept: -m "msg", -m 'msg', -m msg, -am "msg"
        const match = cmd.match(/\s-a?m\s+(?:"([^"]*)"|'([^']*)'|(.+))/);
        if (!match) {
          addLog('error', 'error: commit message required. Usage: git commit -m "<message>"');
          return false;
        }
        const message = (match[1] ?? match[2] ?? match[3] ?? '').trim();
        if (!message) {
          addLog('error', 'Aborting commit due to empty commit message.');
          return false;
        }

        const currentCommit = headCommitOf(newState);
        const nextId = nextCommitId(newState);

        newState.commits[nextId] = {
          id: nextId,
          message,
          parents: currentCommit ? [currentCommit] : [],
          branchHint: newState.isDetached ? 'detached' : newState.HEAD,
          timestamp: now()
        };

        if (newState.isDetached) {
          newState.HEAD = nextId;
        } else {
          newState.branches[newState.HEAD] = nextId;
        }

        addLog('success', `[${newState.isDetached ? 'detached' : newState.HEAD} ${nextId}] ${message}`);
        return newState;
      }

      case 'merge': {
        const targetBranch = args[1];
        if (!targetBranch || !newState.branches[targetBranch]) {
          addLog('error', `merge: ${targetBranch || '<branch>'} - not something we can merge`);
          return false;
        }

        if (newState.isDetached) {
          addLog('error', 'Cannot merge while in detached HEAD state.');
          return false;
        }

        const currentHeadCommit = newState.branches[newState.HEAD];
        const targetCommit = newState.branches[targetBranch];

        if (isAncestor(newState.commits, targetCommit, currentHeadCommit)) {
          addLog('info', 'Already up to date.');
          return null;
        }

        if (isAncestor(newState.commits, currentHeadCommit, targetCommit)) {
          newState.branches[newState.HEAD] = targetCommit;
          addLog('success', `Fast-forward merge of '${targetBranch}' into ${newState.HEAD}.`);
        } else {
          const nextId = nextCommitId(newState);
          newState.commits[nextId] = {
            id: nextId,
            message: `Merge branch '${targetBranch}' into ${newState.HEAD}`,
            parents: [currentHeadCommit, targetCommit],
            branchHint: newState.HEAD,
            timestamp: now()
          };
          newState.branches[newState.HEAD] = nextId;
          addLog('success', `Merge made by the 'ort' strategy. Created commit ${nextId}.`);
        }
        return newState;
      }

      case 'rebase': {
        const upstreamBranch = args[1];
        if (!upstreamBranch || !newState.branches[upstreamBranch]) {
          addLog('error', `fatal: invalid upstream '${upstreamBranch || ''}'`);
          return false;
        }

        const targetCommit = newState.branches[upstreamBranch];
        const currentCommit = headCommitOf(newState);

        if (isAncestor(newState.commits, targetCommit, currentCommit)) {
          addLog('info', 'Current branch is up to date.');
          return null;
        }

        // Fast-forward if current is behind upstream
        if (isAncestor(newState.commits, currentCommit, targetCommit)) {
          if (newState.isDetached) newState.HEAD = targetCommit;
          else newState.branches[newState.HEAD] = targetCommit;
          addLog('success', `Fast-forwarded ${newState.HEAD} to ${upstreamBranch}.`);
          return newState;
        }

        // Collect commits on the current line (first-parent) that upstream doesn't have,
        // then replay them oldest-first on top of upstream.
        const toReplay = [];
        let c = currentCommit;
        while (c && !isAncestor(newState.commits, c, targetCommit)) {
          toReplay.unshift(newState.commits[c]);
          c = newState.commits[c].parents[0];
        }

        let base = targetCommit;
        const hint = newState.isDetached ? 'detached' : newState.HEAD;
        toReplay.forEach(original => {
          const nextId = nextCommitId(newState);
          newState.commits[nextId] = {
            id: nextId,
            message: original.message,
            parents: [base],
            branchHint: hint,
            timestamp: now(),
            rebasedFrom: original.id
          };
          base = nextId;
        });

        if (newState.isDetached) newState.HEAD = base;
        else newState.branches[newState.HEAD] = base;

        addLog('success', `Successfully rebased ${toReplay.length} commit(s) and updated refs/heads/${newState.HEAD}.`);
        return newState;
      }

      case 'tag': {
        const tagName = args[1];
        if (!tagName) {
          const tagNames = Object.keys(newState.tags);
          if (tagNames.length === 0) addLog('info', 'No tags yet.');
          tagNames.forEach(t => addLog('info', `  ${t} -> ${newState.tags[t]}`));
          return null;
        }
        if (tagName === '-d') {
          const t = args[2];
          if (!t || !newState.tags[t]) {
            addLog('error', `error: tag '${t || ''}' not found.`);
            return false;
          }
          delete newState.tags[t];
          addLog('success', `Deleted tag '${t}'`);
          return newState;
        }
        if (!isValidRefName(tagName)) {
          addLog('error', `fatal: '${tagName}' is not a valid tag name.`);
          return false;
        }
        if (newState.tags[tagName]) {
          addLog('error', `fatal: tag '${tagName}' already exists`);
          return false;
        }
        const currentHeadCommit = headCommitOf(newState);
        newState.tags[tagName] = currentHeadCommit;
        addLog('success', `Created tag '${tagName}' at commit ${currentHeadCommit}`);
        return newState;
      }

      case 'reset': {
        if (args[1] === '--hard' && args[2]) {
          const targetC = newState.branches[args[2]] || newState.tags[args[2]] || args[2];
          if (!newState.commits[targetC]) {
            addLog('error', `fatal: Cannot reset to '${args[2]}': unknown commit.`);
            return false;
          }
          if (newState.isDetached) {
            newState.HEAD = targetC;
          } else {
            newState.branches[newState.HEAD] = targetC;
          }
          addLog('warning', `HEAD is now at ${targetC} (${newState.commits[targetC].message})`);
          return newState;
        }
        addLog('error', 'Usage: git reset --hard <commit-id>');
        return false;
      }

      case 'stash': {
        if (args[1] === 'pop') {
          if (!newState.stash || newState.stash.length === 0) {
            addLog('error', 'No stash entries found.');
            return false;
          }
          const popped = newState.stash.pop();
          addLog('success', `Restored and dropped stash entry: "${popped.name}"`);
          return newState;
        }
        if (args[1] === 'list') {
          if (!newState.stash?.length) addLog('info', 'Stash is empty.');
          [...(newState.stash || [])].reverse().forEach((s, i) => addLog('info', `stash@{${i}}: ${s.name}`));
          return null;
        }
        if (!newState.stash) newState.stash = [];
        newState.stash.push({ id: Date.now(), name: 'WIP on ' + newState.HEAD });
        addLog('success', `Saved working directory state WIP on ${newState.HEAD}`);
        return newState;
      }

      default:
        addLog('error', `git: '${subCmd}' is not a git command. Type 'git help' for list.`);
        return false;
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      executeCommand(commandInput);
      setCommandInput('');
    } else if (e.key === 'ArrowUp') {
      if (cliHistory.length > 0) {
        const nextIdx = cliHistoryIndex === -1 ? cliHistory.length - 1 : Math.max(0, cliHistoryIndex - 1);
        setCliHistoryIndex(nextIdx);
        setCommandInput(cliHistory[nextIdx]);
      }
    } else if (e.key === 'ArrowDown') {
      if (cliHistoryIndex !== -1) {
        const nextIdx = cliHistoryIndex + 1;
        if (nextIdx >= cliHistory.length) {
          setCliHistoryIndex(-1);
          setCommandInput('');
        } else {
          setCliHistoryIndex(nextIdx);
          setCommandInput(cliHistory[nextIdx]);
        }
      }
    }
  };

  // --- GRAPH COORDINATE CALCULATOR (DAG) ---
  const graphData = useMemo(() => {
    const commitKeys = Object.keys(gitState.commits);
    const branchNames = Object.keys(gitState.branches);

    // Map each branch or track to a row index (y)
    const trackMap = { 'main': 0 };
    let nextTrack = 1;

    branchNames.forEach(b => {
      if (b !== 'main' && trackMap[b] === undefined) {
        trackMap[b] = nextTrack++;
      }
    });

    const positions = {};
    const colSpacing = 110;
    const rowSpacing = 85;
    const offsetX = 70;
    // Leave headroom for branch badges stacked above the busiest commit on the top row.
    const badgesPerCommit = {};
    Object.values(gitState.branches).forEach(cid => {
      badgesPerCommit[cid] = (badgesPerCommit[cid] || 0) + 1;
    });
    if (gitState.isDetached) badgesPerCommit[gitState.HEAD] = (badgesPerCommit[gitState.HEAD] || 0) + 1;
    const maxBadges = Math.max(1, ...Object.values(badgesPerCommit));
    const offsetY = 70 + (maxBadges - 1) * 22;

    commitKeys.forEach((cid, index) => {
      const commit = gitState.commits[cid];
      let row = 0;
      if (commit.branchHint && trackMap[commit.branchHint] !== undefined) {
        row = trackMap[commit.branchHint];
      } else {
        row = 0;
      }

      positions[cid] = {
        x: offsetX + index * colSpacing,
        y: offsetY + row * rowSpacing,
        ...commit
      };
    });

    // Generate links
    const links = [];
    commitKeys.forEach(cid => {
      const c = gitState.commits[cid];
      c.parents.forEach(pid => {
        if (positions[pid] && positions[cid]) {
          links.push({
            id: `${pid}->${cid}`,
            from: positions[pid],
            to: positions[cid]
          });
        }
      });
    });

    const maxRow = Math.max(0, ...Object.values(positions).map(p => (p.y - offsetY) / rowSpacing));
    return {
      nodes: positions,
      links,
      width: Math.max(700, commitKeys.length * colSpacing + 180),
      height: Math.max(260, offsetY + maxRow * rowSpacing + 80)
    };
  }, [gitState]);

  return (
    <div className="flex flex-col h-[100dvh] bg-slate-950 text-slate-100 font-sans selection:bg-orange-500 selection:text-white">
      {/* --- TOP NAVBAR --- */}
      <header className="h-16 border-b border-slate-800 bg-slate-900/80 backdrop-blur px-3 sm:px-6 flex items-center justify-between gap-2 z-20">
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-tr from-orange-600 to-amber-500 p-2.5 rounded-xl shadow-lg shadow-orange-500/20 text-white">
            <GitPullRequest className="w-5 h-5" />
          </div>
          <div className="hidden sm:block">
            <h1 className="font-bold text-lg tracking-tight bg-gradient-to-r from-white via-slate-200 to-orange-400 bg-clip-text text-transparent">
              GitMastery
            </h1>
            <p className="text-xs text-slate-400">Interactive DAG Tree & Simulator</p>
          </div>
        </div>

        {/* Center Mode Switch */}
        <div className="flex items-center bg-slate-800/90 p-1 rounded-xl border border-slate-700/60 shadow-inner">
          <button
            onClick={() => setMode('lessons')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              mode === 'lessons' ? 'bg-orange-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Curriculum</span>
          </button>
          <button
            onClick={() => setMode('sandbox')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              mode === 'sandbox' ? 'bg-orange-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Free Sandbox</span>
          </button>
        </div>

        {/* Gamification Stats */}
        <div className="flex items-center gap-2 sm:gap-4">
          {/* Daily Streak */}
          <button
            onClick={claimStreak}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border transition group ${
              streakClaimed
                ? 'border-orange-500/40 bg-orange-500/10 text-orange-400'
                : 'border-slate-700 bg-slate-800/60 hover:border-orange-500/50 hover:bg-orange-500/10'
            }`}
            title="Click to check in your daily learning streak!"
          >
            <Flame className={`w-4 h-4 text-orange-500 ${streakClaimed ? 'animate-bounce' : 'group-hover:scale-110 transition'}`} />
            <div className="text-left text-xs">
              <span className="font-bold text-slate-200">{streak} Days</span>
              <span className="text-[10px] block text-slate-400">{streakClaimed ? 'Checked In' : 'Claim Daily'}</span>
            </div>
          </button>

          {/* XP & Level */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-700 bg-slate-800/60 text-xs">
            <Zap className="w-4 h-4 text-amber-400" />
            <div>
              <span className="font-bold text-slate-200">{xp} XP</span>
              <span className="text-[10px] block text-amber-400/90 font-medium">Lvl {Math.floor(xp / 100) + 1}</span>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="hidden lg:flex flex-col w-36 gap-1">
            <div className="flex justify-between text-[11px] text-slate-400">
              <span>Course Progress</span>
              <span className="font-semibold text-orange-400">{progressPercent}%</span>
            </div>
            <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden border border-slate-700">
              <div
                className="h-full bg-gradient-to-r from-orange-500 to-amber-400 transition-all duration-500 rounded-full"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        </div>
      </header>

      {/* --- MAIN INTERFACE WORKSPACE --- */}
      <div className="flex-1 flex overflow-hidden">
        {/* LEFT SIDEBAR: CURRICULUM LESSONS */}
        <aside className="hidden md:flex w-72 lg:w-80 shrink-0 border-r border-slate-800 bg-slate-900/50 flex-col justify-between">
          <div className="p-4 overflow-y-auto flex-1">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-orange-400" />
                Lesson Roadmap
              </h2>
              <span className="text-xs bg-slate-800 px-2 py-0.5 rounded-full text-slate-300">
                {completedLessons.length}/{CURRICULUM.length}
              </span>
            </div>

            <div className="space-y-2">
              {CURRICULUM.map((lesson) => {
                const isCompleted = completedLessons.includes(lesson.id);
                const isCurrent = currentLessonId === lesson.id;

                return (
                  <button
                    key={lesson.id}
                    onClick={() => {
                      setCurrentLessonId(lesson.id);
                      setMode('lessons');
                    }}
                    className={`w-full text-left p-3 rounded-xl border transition flex items-start gap-3 relative ${
                      isCurrent
                        ? 'border-orange-500/60 bg-orange-500/10 text-white'
                        : isCompleted
                        ? 'border-emerald-500/30 bg-slate-900/60 text-slate-300 hover:border-slate-700'
                        : 'border-slate-800/80 bg-slate-900/30 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                    }`}
                  >
                    <div className="mt-0.5">
                      {isCompleted ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <div className={`w-4 h-4 rounded-full border flex items-center justify-center text-[10px] ${
                          isCurrent ? 'border-orange-400 text-orange-300' : 'border-slate-600 text-slate-500'
                        }`}>
                          {lesson.id}
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold truncate">{lesson.title}</span>
                      </div>
                      <span className="text-[10px] text-slate-500 block truncate">{lesson.category}</span>
                    </div>

                    {isCurrent && (
                      <ChevronRight className="w-4 h-4 text-orange-400 self-center" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Lesson Quick Actions / Presets */}
          <div className="p-4 border-t border-slate-800 bg-slate-900/70 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
                Playground Controls
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handleUndo}
                disabled={historyIndex <= 0}
                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-slate-800 text-xs font-medium text-slate-200 border border-slate-700 transition"
              >
                Undo Last Step
              </button>
              <button
                onClick={handleResetRepo}
                className="px-2.5 py-1.5 rounded-lg bg-red-950/40 hover:bg-red-900/50 text-red-300 border border-red-800/50 text-xs font-medium transition"
              >
                Reset Tree
              </button>
            </div>
            <button
              onClick={handleResetProgress}
              className="w-full px-2.5 py-1.5 rounded-lg text-[11px] text-slate-500 hover:text-slate-300 hover:bg-slate-800/60 transition"
            >
              Reset Lesson Progress
            </button>
          </div>
        </aside>

        {/* CENTER / RIGHT PANELS: VISUAL GRAPH + TERMINAL + THEORY */}
        <main className="flex-1 flex flex-col min-w-0">
          {/* LESSON INSTRUCTION BANNER (When in Lessons Mode) */}
          {mode === 'lessons' && (
            <div className="bg-gradient-to-r from-slate-900 via-slate-900/90 to-slate-950 border-b border-slate-800 p-4 px-4 sm:px-6 flex flex-col md:flex-row md:items-center justify-between gap-3 md:gap-6">
              <div className="max-w-3xl">
                <div className="flex items-center gap-2 mb-1">
                  <span className="px-2 py-0.5 bg-orange-500/20 text-orange-400 border border-orange-500/30 rounded text-[11px] font-semibold">
                    Task #{currentLesson.id}
                  </span>
                  <h2 className="text-sm font-bold text-white">{currentLesson.title}</h2>
                </div>
                <p className="text-xs text-slate-300 mb-1">{currentLesson.description}</p>
                <p className="text-[11px] text-slate-400 mb-1.5 flex items-start gap-1.5">
                  <Sparkles className="w-3 h-3 mt-0.5 text-amber-400 shrink-0" />
                  {currentLesson.theory}
                </p>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-emerald-400 font-semibold flex items-center gap-1">
                    <TargetIcon className="w-3.5 h-3.5" /> Goal:
                  </span>
                  <span className="text-slate-300 bg-slate-800/80 px-2 py-0.5 rounded font-mono border border-slate-700/60">
                    {currentLesson.task}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {isCurrentLessonDone && nextLesson && (
                  <button
                    onClick={() => setCurrentLessonId(nextLesson.id)}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 transition"
                  >
                    Next Lesson
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
                {isCurrentLessonDone && !nextLesson && (
                  <span className="px-3 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs font-semibold flex items-center gap-1.5">
                    <Award className="w-3.5 h-3.5" />
                    Course Complete!
                  </span>
                )}
                <button
                  onClick={() => addLog('warning', `💡 Hint: ${currentLesson.hint}`)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs font-medium flex items-center gap-1.5 transition"
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                  Hint
                </button>
                <button
                  onClick={() => {
                    executeCommand(currentLesson.targetCommand);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-orange-600/20 hover:bg-orange-600/30 border border-orange-500/40 text-orange-300 text-xs font-medium flex items-center gap-1.5 transition"
                  title="Auto-fill and execute target command"
                >
                  <Play className="w-3.5 h-3.5" />
                  Auto Solve
                </button>
              </div>
            </div>
          )}

          {/* VISUAL SVG GRAPH PLAYGROUND */}
          <div className="flex-1 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 relative overflow-auto p-6 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-orange-400" />
                <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">Live Git DAG Tree</span>
              </div>
              <div className="flex items-center gap-4 text-[11px] text-slate-400">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-orange-500"></div>
                  <span>Commit Node</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded bg-blue-500/30 border border-blue-400 text-blue-300 text-[9px] flex items-center justify-center font-bold">B</div>
                  <span>Branch Ref</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded bg-amber-500/30 border border-amber-400 text-amber-300 text-[9px] flex items-center justify-center font-bold">H</div>
                  <span>HEAD Pointer</span>
                </div>
              </div>
            </div>

            {/* SVG Visual Canvas */}
            <div className="flex-1 w-full bg-slate-900/60 rounded-2xl border border-slate-800 shadow-2xl relative overflow-auto flex p-4 min-h-[200px]">
              <svg
                width={graphData.width}
                height={graphData.height}
                className="overflow-visible select-none shrink-0 my-auto"
              >
                <defs>
                  <linearGradient id="linkGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#475569" />
                    <stop offset="100%" stopColor="#f97316" />
                  </linearGradient>
                  <marker
                    id="arrowhead"
                    markerWidth="7"
                    markerHeight="7"
                    refX="14"
                    refY="3.5"
                    orient="auto"
                  >
                    <polygon points="0 0, 7 3.5, 0 7" fill="#64748b" />
                  </marker>
                </defs>

                {/* Graph Link Curves */}
                {graphData.links.map(link => {
                  const path = `M ${link.from.x} ${link.from.y} C ${link.from.x + 40} ${link.from.y}, ${link.to.x - 40} ${link.to.y}, ${link.to.x} ${link.to.y}`;
                  return (
                    <g key={link.id}>
                      <path
                        d={path}
                        fill="none"
                        stroke="#334155"
                        strokeWidth="3"
                        strokeDasharray="4 3"
                      />
                      <path
                        d={path}
                        fill="none"
                        stroke="#f97316"
                        strokeWidth="2.5"
                        className="animate-pulse"
                      />
                    </g>
                  );
                })}

                {/* Commit Nodes & Tags & Branches */}
                {Object.values(graphData.nodes).map(node => {
                  const attachedBranches = Object.entries(gitState.branches)
                    .filter(([_, cid]) => cid === node.id)
                    .map(([bName]) => bName);

                  const attachedTags = Object.entries(gitState.tags)
                    .filter(([_, cid]) => cid === node.id)
                    .map(([tName]) => tName);

                  const isHeadHere = gitState.isDetached
                    ? gitState.HEAD === node.id
                    : attachedBranches.includes(gitState.HEAD);

                  return (
                    <g key={node.id} className="transition-all duration-300">
                      {/* Outer Glow if HEAD */}
                      {isHeadHere && (
                        <circle
                          cx={node.x}
                          cy={node.y}
                          r={24}
                          fill="none"
                          stroke="#fb923c"
                          strokeWidth="2"
                          strokeDasharray="3 3"
                          className="animate-spin origin-center"
                          style={{ transformOrigin: `${node.x}px ${node.y}px` }}
                        />
                      )}

                      {/* Main Commit Circle */}
                      <circle
                        cx={node.x}
                        cy={node.y}
                        r={18}
                        className="fill-orange-600 stroke-orange-400 stroke-2 hover:fill-orange-500 cursor-pointer shadow-lg transition"
                      />

                      {/* Commit Label */}
                      <text
                        x={node.x}
                        y={node.y + 4}
                        textAnchor="middle"
                        fill="#ffffff"
                        fontSize="11"
                        fontWeight="bold"
                        pointerEvents="none"
                      >
                        {node.id}
                      </text>

                      {/* Commit Message Below */}
                      <text
                        x={node.x}
                        y={node.y + 36}
                        textAnchor="middle"
                        fill="#cbd5e1"
                        fontSize="10"
                        className="font-mono bg-slate-900"
                      >
                        {node.message.length > 15 ? node.message.slice(0, 13) + '…' : node.message}
                      </text>

                      {/* Badges Stacked Above Node */}
                      <g transform={`translate(${node.x}, ${node.y - 28})`}>
                        {/* Branches Badges */}
                        {attachedBranches.map((b, i) => {
                          const isCurrentBranch = gitState.HEAD === b && !gitState.isDetached;
                          return (
                            <g key={b} transform={`translate(0, -${i * 22})`}>
                              <rect
                                x={-Math.max(32, b.length * 3.2 + 12)}
                                y="-16"
                                width={Math.max(64, b.length * 6.4 + 24)}
                                height="18"
                                rx="5"
                                fill={isCurrentBranch ? '#0284c7' : '#1e293b'}
                                stroke={isCurrentBranch ? '#38bdf8' : '#475569'}
                                strokeWidth="1.2"
                              />
                              <text
                                x="0"
                                y="-4"
                                textAnchor="middle"
                                fill={isCurrentBranch ? '#ffffff' : '#cbd5e1'}
                                fontSize="9"
                                fontWeight="bold"
                              >
                                {isCurrentBranch ? `* ${b}` : b}
                              </text>
                            </g>
                          );
                        })}

                        {/* HEAD Badge if Detached */}
                        {gitState.isDetached && gitState.HEAD === node.id && (
                          <g transform={`translate(0, -${attachedBranches.length * 22})`}>
                            <rect
                              x="-26"
                              y="-16"
                              width="52"
                              height="18"
                              rx="5"
                              fill="#d97706"
                              stroke="#fbbf24"
                              strokeWidth="1.2"
                            />
                            <text
                              x="0"
                              y="-4"
                              textAnchor="middle"
                              fill="#ffffff"
                              fontSize="9"
                              fontWeight="bold"
                            >
                              HEAD
                            </text>
                          </g>
                        )}

                        {/* Tag Badges */}
                        {attachedTags.map((tag, i) => (
                          <g key={tag} transform={`translate(42, -${i * 18})`}>
                            <rect
                              x="0"
                              y="-14"
                              width="46"
                              height="16"
                              rx="4"
                              fill="#047857"
                              stroke="#34d399"
                              strokeWidth="1"
                            />
                            <text
                              x="23"
                              y="-3"
                              textAnchor="middle"
                              fill="#ffffff"
                              fontSize="8"
                              fontWeight="bold"
                            >
                              🏷️ {tag}
                            </text>
                          </g>
                        ))}
                      </g>
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>

          {/* BOTTOM TERMINAL CLI */}
          <div className="h-64 border-t border-slate-800 bg-slate-950 flex flex-col font-mono text-xs shadow-inner">
            <div className="h-8 bg-slate-900 border-b border-slate-800 px-4 flex items-center justify-between select-none">
              <div className="flex items-center gap-2 text-slate-400">
                <Terminal className="w-3.5 h-3.5 text-orange-500" />
                <span className="font-semibold text-slate-300">Terminal CLI</span>
                <span className="text-[10px] text-slate-500 hidden lg:inline">(Supports commit, branch, merge, rebase, checkout, reset, tag, stash, status)</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setTerminalLogs([])}
                  className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-400 hover:text-white transition"
                >
                  Clear Logs
                </button>
              </div>
            </div>

            {/* Scrollable Output */}
            <div
              ref={terminalEndRef}
              className="flex-1 p-4 overflow-y-auto space-y-1 text-slate-300 font-mono"
              onClick={() => inputRef.current?.focus()}
            >
              {terminalLogs.map((log, i) => {
                let color = 'text-slate-300';
                if (log.type === 'input') color = 'text-orange-400 font-bold';
                if (log.type === 'success') color = 'text-emerald-400';
                if (log.type === 'error') color = 'text-rose-400';
                if (log.type === 'warning') color = 'text-amber-400';
                if (log.type === 'info') color = 'text-sky-300';
                if (log.type === 'system') color = 'text-slate-500 italic';

                return (
                  <div key={i} className={`leading-relaxed whitespace-pre-wrap ${color}`}>
                    {log.text}
                  </div>
                );
              })}
            </div>

            {/* Input Prompt */}
            <div className="p-3 bg-slate-900/70 border-t border-slate-800 flex items-center gap-2">
              <span className="text-orange-500 font-bold flex items-center gap-1 select-none">
                git-mastery <span className="text-slate-500">({gitState.isDetached ? 'HEAD detached' : gitState.HEAD})</span> $
              </span>
              <input
                ref={inputRef}
                type="text"
                value={commandInput}
                onChange={(e) => setCommandInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a git command (e.g. git commit -m 'new update') or 'git help'..."
                className="flex-1 bg-transparent text-slate-100 placeholder:text-slate-600 outline-none font-mono"
                autoFocus
              />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

function TargetIcon(props) {
  return (
    <svg
      {...props}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  );
}
