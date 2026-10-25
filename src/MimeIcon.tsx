import AudioFileIcon from "@mui/icons-material/AudioFile";
import CodeIcon from "@mui/icons-material/Code";
import DescriptionIcon from "@mui/icons-material/Description";
import EventIcon from "@mui/icons-material/Event";
import FolderIcon from "@mui/icons-material/Folder";
import FolderZipOutlinedIcon from "@mui/icons-material/FolderZipOutlined";
import ImageIcon from "@mui/icons-material/Image";
import InsertDriveFileOutlinedIcon from "@mui/icons-material/InsertDriveFileOutlined";
import PdfIcon from "@mui/icons-material/PictureAsPdf";
import VideoFileIcon from "@mui/icons-material/VideoFile";
import { mimeCategory } from "./app/mime";
import type { FileItem } from "./app/types";

function MimeIcon({
  file,
  fontSize = "large",
}: {
  file: FileItem;
  fontSize?: "small" | "medium" | "large";
}) {
  switch (mimeCategory(file)) {
    case "folder":
      return <FolderIcon fontSize={fontSize} />;
    case "image":
      return <ImageIcon fontSize={fontSize} />;
    case "audio":
      return <AudioFileIcon fontSize={fontSize} />;
    case "video":
      return <VideoFileIcon fontSize={fontSize} />;
    case "pdf":
      return <PdfIcon fontSize={fontSize} />;
    case "archive":
      return <FolderZipOutlinedIcon fontSize={fontSize} />;
    case "calendar":
      return <EventIcon fontSize={fontSize} />;
    case "code":
      return <CodeIcon fontSize={fontSize} />;
    case "document":
      return <DescriptionIcon fontSize={fontSize} />;
    default:
      return <InsertDriveFileOutlinedIcon fontSize={fontSize} />;
  }
}

export default MimeIcon;
