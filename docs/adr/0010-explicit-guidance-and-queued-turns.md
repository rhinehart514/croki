# Separate Live Guidance from queued turns

An idle Thread message starts the Canonical Provider Lane, while ordinary Thread-addressed messages received during a running turn enter a durable next-turn queue. Live Guidance is a separate, explicitly agent-addressed action against the exact active turn and exists only when the selected provider proves native steering. This avoids silently changing a person's meaning, starting competing primary turns, or manufacturing provider-neutral steering.
