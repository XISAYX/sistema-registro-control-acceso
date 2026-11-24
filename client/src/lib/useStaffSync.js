import { useEffect } from "react";
import { flushPendingQueue, syncAttendeesCache } from "./sync.js";

export function useStaffSync() {
  useEffect(() => {
    let stopped = false;
    const tick = async () => {
      if (stopped) return;
      await flushPendingQueue();
      try {
        await syncAttendeesCache();
      } catch {
        // The next pass retries. An invalid token pauses staff calls.
      }
    };
    void tick();
    const id = window.setInterval(tick, 4000);
    window.addEventListener("online", tick);
    return () => {
      stopped = true;
      window.clearInterval(id);
      window.removeEventListener("online", tick);
    };
  }, []);
}
