// One narrow promise seam between a nonblocking dialogue dispatch and durable Run acceptance. The
// provider task continues in the background; callers await only onRunAccepted, which fires after the
// founder-turn journal CAS. Test doubles that settle synchronously retain the legacy fallback.

export function launchAcceptedWork(drive, input, onFailure = null) {
  let resolveAccepted;
  let rejectAccepted;
  const accepted = new Promise((resolve, reject) => {
    resolveAccepted = resolve;
    rejectAccepted = reject;
  });
  const priorAccepted = input.deps?.onRunAccepted;
  const acceptedInput = {
    ...input,
    deps: {
      ...(input.deps ?? {}),
      onRunAccepted: (receipt) => {
        priorAccepted?.(receipt);
        resolveAccepted(receipt);
      },
    },
  };
  let task;
  try {
    task = Promise.resolve(drive(acceptedInput));
  } catch (error) {
    task = Promise.reject(error);
  }
  task.then(
    (value) => resolveAccepted({ settled: true, value }),
    (error) => {
      rejectAccepted(error);
      try { onFailure?.(error); } catch { /* reporting cannot replace the accepted task's failure */ }
    },
  );
  return { task, accepted };
}
