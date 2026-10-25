import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { processTransferTask } from "./transfer";
import type { TransferTask } from "./types";

interface TransferActions {
  retry: (id: string) => void;
  remove: (id: string) => void;
  clearCompleted: () => void;
}

const TransferQueueContext = createContext<TransferTask[]>([]);
const SetTransferQueueContext = createContext<
  React.Dispatch<React.SetStateAction<TransferTask[]>>
>(() => {});
const TransferActionsContext = createContext<TransferActions>({
  retry: () => {},
  remove: () => {},
  clearCompleted: () => {},
});

function newTaskId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function useTransferQueue(): TransferTask[] {
  return useContext(TransferQueueContext);
}

export function useTransferActions(): TransferActions {
  return useContext(TransferActionsContext);
}

export function useUploadEnqueue() {
  const setTransferTasks = useContext(SetTransferQueueContext);
  return useCallback(
    (...requests: { basedir: string; file: File }[]) => {
      const newTasks = requests.map(
        ({ basedir, file }): TransferTask => ({
          id: newTaskId(),
          type: "upload",
          status: "pending",
          name: file.name,
          file,
          remoteKey: basedir + file.name,
          loaded: 0,
          total: file.size,
        })
      );
      setTransferTasks((tasks) => [...tasks, ...newTasks]);
    },
    [setTransferTasks]
  );
}

export function TransferQueueProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [transferTasks, setTransferTasks] = useState<TransferTask[]>([]);
  const taskProcessing = useRef<string | null>(null);

  const updateTask = useCallback(
    (id: string, patch: Partial<TransferTask>) => {
      setTransferTasks((tasks) =>
        tasks.map((task) => (task.id === id ? { ...task, ...patch } : task))
      );
    },
    []
  );

  useEffect(() => {
    const taskToProcess = transferTasks.find(
      (task) => task.status === "pending"
    );
    if (!taskToProcess || taskProcessing.current) return;

    taskProcessing.current = taskToProcess.id;
    updateTask(taskToProcess.id, {
      status: "in-progress",
      loaded: 0,
      error: undefined,
    });

    processTransferTask({
      task: taskToProcess,
      onTaskProgress: (loaded) => updateTask(taskToProcess.id, { loaded }),
    })
      .then(() => {
        updateTask(taskToProcess.id, {
          status: "completed",
          loaded: taskToProcess.total,
          error: undefined,
        });
      })
      .catch((error: unknown) => {
        updateTask(taskToProcess.id, {
          status: "failed",
          error: error instanceof Error ? error : new Error(String(error)),
        });
      })
      .finally(() => {
        taskProcessing.current = null;
        // Kick the next pending task after this render.
        setTransferTasks((tasks) => [...tasks]);
      });
  }, [transferTasks, updateTask]);

  const actions = useMemo<TransferActions>(
    () => ({
      retry: (id: string) =>
        setTransferTasks((tasks) =>
          tasks.map((task) =>
            task.id === id && task.status === "failed"
              ? { ...task, status: "pending", loaded: 0, error: undefined }
              : task
          )
        ),
      remove: (id: string) =>
        setTransferTasks((tasks) => tasks.filter((task) => task.id !== id)),
      clearCompleted: () =>
        setTransferTasks((tasks) =>
          tasks.filter((task) => task.status !== "completed")
        ),
    }),
    []
  );

  return (
    <TransferQueueContext.Provider value={transferTasks}>
      <SetTransferQueueContext.Provider value={setTransferTasks}>
        <TransferActionsContext.Provider value={actions}>
          {children}
        </TransferActionsContext.Provider>
      </SetTransferQueueContext.Provider>
    </TransferQueueContext.Provider>
  );
}
