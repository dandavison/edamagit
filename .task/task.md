Currently, edamagit does not display diffs with syntax highlighting:

/var/folders/d2/hflhkhsd08v8nbjf3jf9yfdm0000gn/T/clipboard-1773222136247.png

I would like edamagit to use delta (https://github.com/dandavison/delta) for syntax highlighting. Use delta -h to get an overview of all commands.

For reference, look at how I do this in magit-delta: ~/src/magit-delta. There are some delta args you'll want to use for this use case.
