# Keep one canonical provider lane per Thread

Each Thread has one canonical provider lane, while delegated agents and materially separate attempts remain durable Worker Threads. We reject simultaneous independent primary agent turns inside one Thread because they would create competing conversations, workspace mutations, checkpoints, and authority; parallelism remains substantial without sacrificing one understandable account of the work.
