import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  LinearProgress,
  List,
  ListItem,
  ListItemText,
  Tooltip,
  Typography,
} from "@mui/material";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import ReplayIcon from "@mui/icons-material/Replay";
import React from "react";
import {
  useTransferActions,
  useTransferQueue,
} from "./app/transferQueue";
import { humanReadableSize } from "./app/utils";

export default function ProgressDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const tasks = useTransferQueue();
  const { retry, remove, clearCompleted } = useTransferActions();
  const completed = tasks.filter((task) => task.status === "completed").length;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Uploads</DialogTitle>
      <DialogContent sx={{ p: 0 }}>
        {tasks.length === 0 ? (
          <Typography color="text.secondary" textAlign="center" sx={{ py: 5 }}>
            No upload tasks
          </Typography>
        ) : (
          <List disablePadding>
            {tasks.map((task) => {
              const progress =
                task.total > 0
                  ? Math.min(100, Math.round((task.loaded / task.total) * 100))
                  : 0;
              return (
                <ListItem
                  key={task.id}
                  divider
                  secondaryAction={
                    <Box sx={{ display: "flex", gap: 0.25 }}>
                      {task.status === "failed" && (
                        <Tooltip title="Retry">
                          <IconButton
                            edge="end"
                            aria-label="Retry upload"
                            onClick={() => retry(task.id)}
                          >
                            <ReplayIcon />
                          </IconButton>
                        </Tooltip>
                      )}
                      {task.status !== "in-progress" && (
                        <Tooltip title="Remove from list">
                          <IconButton
                            edge="end"
                            aria-label="Remove task"
                            onClick={() => remove(task.id)}
                          >
                            <DeleteOutlineIcon />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Box>
                  }
                >
                  <ListItemText
                    primary={task.name}
                    secondary={
                      <>
                        {task.status === "failed" ? (
                          <Typography component="span" variant="body2" color="error">
                            {task.error?.message || "Upload failed"}
                          </Typography>
                        ) : (
                          <Typography component="span" variant="body2" color="text.secondary">
                            {humanReadableSize(task.loaded)} /{" "}
                            {humanReadableSize(task.total)}
                            {task.status === "completed" ? " · Completed" : ""}
                          </Typography>
                        )}
                        {(task.status === "in-progress" || task.status === "pending") && (
                          <LinearProgress
                            variant="determinate"
                            value={task.status === "pending" ? 0 : progress}
                            sx={{ mt: 1, borderRadius: 1 }}
                          />
                        )}
                      </>
                    }
                  />
                  {task.status === "completed" && (
                    <CheckCircleOutlineIcon color="success" sx={{ ml: 1 }} />
                  )}
                  {task.status === "failed" && (
                    <ErrorOutlineIcon color="error" sx={{ ml: 1 }} />
                  )}
                </ListItem>
              );
            })}
          </List>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={() => clearCompleted()} disabled={completed === 0}>
          Clear completed
        </Button>
        <Button variant="contained" onClick={onClose}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}
