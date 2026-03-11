Currently, edamagit does not display diffs with syntax highlighting:

/var/folders/d2/hflhkhsd08v8nbjf3jf9yfdm0000gn/T/clipboard-1773222136247.png

 highlightDiffWithDelta is a standalone utility that the tests exercise, but no code path in the extension calls it. We just added it, so we can change it if necessary.

 The task is to modify edamagit to use this function to highlight diffs.

 Performance is key here. Human eyeballs are on every keystroke waiting for the GUI to be ready. Ensure that the plan is taking appropriate performance steps. This doesn't
mean over-complicating for speculative and unproven wins. It means that if there is a low-hanging fruit with an obvious big win, we take it. Do we have a way to measure performance so that we're not guessing?
Make a plan that an experienced JS/vscode engineer with a lot of performance and engineering wisdom would do?