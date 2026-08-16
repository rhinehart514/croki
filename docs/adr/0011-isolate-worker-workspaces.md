# Isolate Worker Thread workspaces

A concurrently writing Worker Thread receives its own worktree and branch by default. Sharing the parent's mutable workspace is allowed only through an explicit serialized workspace policy because concurrent provider, terminal, checkpoint, and restore writes otherwise corrupt attribution and evidence. Worker results return through durable lineage and normal Git integration rather than by treating a shared directory as coordination.
