import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import MoreVertRoundedIcon from "@mui/icons-material/MoreVertRounded";
import PhotoLibraryOutlinedIcon from "@mui/icons-material/PhotoLibraryOutlined";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import CameraAltOutlinedIcon from "@mui/icons-material/CameraAltOutlined";
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded";
import KeyboardArrowDownRoundedIcon from "@mui/icons-material/KeyboardArrowDownRounded";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import {
  chatGallery,
  hasNativeChatGallery,
  pickedMediaFile,
  type GalleryAlbum,
  type GalleryMedia,
} from "../lib/chatGallery";

type Props = {
  onClose: () => void;
  onChoose: (file: File) => void;
  onDocument: () => void;
  busy: boolean;
};
export default function ChatAttachmentSheet({
  onClose,
  onChoose,
  onDocument,
  busy,
}: Props) {
  const native = hasNativeChatGallery();
  const [expanded, setExpanded] = useState(false),
    [albumsOpen, setAlbumsOpen] = useState(false),
    [menuOpen, setMenuOpen] = useState(false);
  const [albums, setAlbums] = useState<GalleryAlbum[]>([]),
    [album, setAlbum] = useState("all"),
    [media, setMedia] = useState<GalleryMedia[]>([]);
  const [localFiles, setLocalFiles] = useState<File[]>([]),
    [selected, setSelected] = useState<string>(),
    [loading, setLoading] = useState(native),
    [reading, setReading] = useState(false),
    [more, setMore] = useState(false),
    [limited, setLimited] = useState(false),
    [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null),
    camera = useRef<HTMLInputElement>(null),
    sheet = useRef<HTMLDivElement>(null),
    close = useRef<HTMLButtonElement>(null),
    dragY = useRef(0),
    dragged = useRef(false),
    generation = useRef(0),
    offset = useRef(0),
    loadingPage = useRef(false);
  const localUrls = useRef<string[]>([]);
  const mounted = useRef(true);
  const invalidateLoads = useCallback(() => {
    generation.current++;
  }, []);
  const loadPage = useCallback(
    async (id: string, reset = false) => {
      if (!native || (!reset && loadingPage.current)) return;
      const request = reset ? ++generation.current : generation.current;
      loadingPage.current = true;
      setLoading(true);
      setError("");
      try {
        const result = await chatGallery.media({
          album: id,
          offset: reset ? 0 : offset.current,
          limit: 36,
        });
        if (request !== generation.current) return;
        offset.current = (reset ? 0 : offset.current) + result.items.length;
        setMedia((current) =>
          reset
            ? result.items
            : Array.from(
                new Map(
                  [...current, ...result.items].map((item) => [item.id, item]),
                ).values(),
              ),
        );
        setMore(result.hasMore);
      } catch (e) {
        if (request === generation.current)
          setError(
            e instanceof Error
              ? e.message
              : "Could not load photos. Try Open in.",
          );
      } finally {
        if (request === generation.current) {
          loadingPage.current = false;
          setLoading(false);
        }
      }
    },
    [native],
  );
  useEffect(() => {
    let active = true;
    mounted.current = true;
    const previousFocus = document.activeElement as HTMLElement | null;
    close.current?.focus();
    if (native)
      void chatGallery
        .albums()
        .then((result) => {
          if (!active) return;
          setAlbums(result.albums);
          setLimited(Boolean(result.limited));
          return loadPage("all", true);
        })
        .catch((e) => {
          if (active) {
            setLoading(false);
            setError(
              e instanceof Error
                ? e.message
                : "Open your gallery to choose photos.",
            );
          }
        });
    return () => {
      active = false;
      mounted.current = false;
      invalidateLoads();
      localUrls.current.forEach((url) => URL.revokeObjectURL(url));
      previousFocus?.focus();
    };
  }, [native, loadPage, invalidateLoads]);
  const chooseLocal = (files: FileList | null) => {
    if (!files) return;
    localUrls.current.forEach((url) => URL.revokeObjectURL(url));
    const chosen = Array.from(files)
      .filter((file) => /^(image|video)\//.test(file.type))
      .slice(0, 48);
    const urls = chosen.map((file) => URL.createObjectURL(file));
    localUrls.current = urls;
    setLocalFiles(chosen);
    setMedia(
      chosen.map((file, index) => ({
        id: "local:" + index,
        name: file.name,
        mimeType: file.type,
        size: file.size,
        thumbnail: urls[index],
      })),
    );
    setSelected(undefined);
    setExpanded(true);
    setError(chosen.length ? "" : "Choose an image or video.");
  };
  const openIn = async () => {
    if (reading || busy) return;
    setMenuOpen(false);
    setAlbumsOpen(false);
    if (!native) {
      input.current?.click();
      return;
    }
    setReading(true);
    setError("");
    try {
      const file = pickedMediaFile(await chatGallery.openPicker());
      if (file && mounted.current) onChoose(file);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open this file.");
    } finally {
      setReading(false);
    }
  };
  const choose = async () => {
    if (!selected || reading || busy) return;
    setReading(true);
    setError("");
    try {
      const file = selected.startsWith("local:")
        ? localFiles[Number(selected.slice(6))]
        : pickedMediaFile(await chatGallery.read({ id: selected }));
      if (file && mounted.current) onChoose(file);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open this file.");
    } finally {
      setReading(false);
    }
  };
  const changeAlbum = (id: string) => {
    setAlbum(id);
    setAlbumsOpen(false);
    setSelected(undefined);
    setMedia([]);
    void loadPage(id, true);
  };
  return createPortal(
    <div className="chat-gallery-backdrop" onClick={onClose}>
      <div
        ref={sheet}
        className={
          expanded ? "chat-gallery-sheet expanded" : "chat-gallery-sheet"
        }
        role="dialog"
        aria-modal="true"
        aria-label="Choose an attachment"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            onClose();
          }
          if (event.key === "Tab") {
            const elements = Array.from(
              sheet.current?.querySelectorAll<HTMLElement>(
                "button:not(:disabled), input:not(:disabled)",
              ) || [],
            ).filter((element) => element.getClientRects().length > 0);
            const first = elements[0],
              last = elements.at(-1);
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault();
              last?.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first?.focus();
            }
          }
        }}
      >
        <button
          type="button"
          className="chat-gallery-handle"
          aria-label={expanded ? "Collapse gallery" : "Expand gallery"}
          aria-expanded={expanded}
          onPointerDown={(event) => {
            dragY.current = event.clientY;
            dragged.current = false;
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerUp={(event) => {
            const movement = event.clientY - dragY.current;
            if (Math.abs(movement) > 30) {
              dragged.current = true;
              setExpanded(movement < 0);
            }
          }}
          onClick={(event) => {
            if (event.detail > 0 && dragged.current) return;
            setExpanded((value) => !value);
          }}
        >
          <span />
        </button>
        <header>
          <button
            type="button"
            className="chat-gallery-title"
            aria-expanded={albumsOpen}
            aria-label="Choose gallery album"
            onClick={() => {
              if (native) {
                setExpanded(true);
                setAlbumsOpen((value) => !value);
                setMenuOpen(false);
              } else input.current?.click();
            }}
          >
            {album === "all"
              ? "Gallery"
              : albums.find((item) => item.id === album)?.name || "Gallery"}
            <KeyboardArrowDownRoundedIcon />
          </button>
          <div>
            <button
              type="button"
              aria-label="Gallery options"
              aria-expanded={menuOpen}
              onClick={() => {
                setMenuOpen((value) => !value);
                setAlbumsOpen(false);
              }}
            >
              <MoreVertRoundedIcon />
            </button>
            <button
              ref={close}
              type="button"
              onClick={onClose}
              aria-label="Close attachments"
            >
              <CloseRoundedIcon />
            </button>
          </div>
        </header>
        {menuOpen ? (
          <div className="chat-gallery-menu" role="menu">
            <button type="button" role="menuitem" onClick={() => void openIn()}>
              <OpenInNewRoundedIcon />
              Open in...
            </button>
          </div>
        ) : null}
        {albumsOpen ? (
          <div className="chat-gallery-albums" aria-label="Albums">
            {albums.map((item) => (
              <button
                type="button"
                key={item.id}
                onClick={() => changeAlbum(item.id)}
                aria-pressed={item.id === album}
              >
                {item.thumbnail ? (
                  <img src={item.thumbnail} alt="" />
                ) : (
                  <PhotoLibraryOutlinedIcon />
                )}
                <strong>{item.name}</strong>
                <span>{item.count}</span>
              </button>
            ))}
            {!albums.length ? (
              <button type="button" onClick={() => void openIn()}>
                Open device gallery
              </button>
            ) : null}
          </div>
        ) : null}
        <div
          className="chat-gallery-content"
          onScroll={(event) => {
            const target = event.currentTarget;
            if (target.scrollTop > 12) setExpanded(true);
            if (
              more &&
              target.scrollHeight - target.scrollTop - target.clientHeight < 200
            )
              void loadPage(album);
          }}
        >
          {limited ? (
            <p className="chat-gallery-hint">
              Showing the photos and videos you allowed. Use Open in to choose
              another.
            </p>
          ) : null}
          {error ? (
            <p className="chat-gallery-error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="chat-gallery-grid">
            <button
              type="button"
              className="chat-gallery-camera"
              onClick={() => camera.current?.click()}
              aria-label="Take photo"
            >
              <CameraAltOutlinedIcon />
              <span>Camera</span>
            </button>
            {media.map((item) => (
              <button
                type="button"
                key={item.id}
                className={selected === item.id ? "selected" : ""}
                onClick={() =>
                  setSelected((value) =>
                    value === item.id ? undefined : item.id,
                  )
                }
                aria-pressed={selected === item.id}
                aria-label={item.name}
              >
                {item.thumbnail ? (
                  item.id.startsWith("local:") &&
                  item.mimeType.startsWith("video/") ? (
                    <video src={item.thumbnail} muted preload="metadata" />
                  ) : (
                    <img src={item.thumbnail} alt="" loading="lazy" />
                  )
                ) : (
                  <PhotoLibraryOutlinedIcon />
                )}
                <span className="chat-gallery-selection">
                  {selected === item.id ? <CheckRoundedIcon /> : null}
                </span>
                {item.mimeType.startsWith("video/") ? (
                  <span className="chat-gallery-duration">
                    Video
                    {item.duration
                      ? " " +
                        Math.floor(item.duration / 60) +
                        ":" +
                        String(Math.floor(item.duration % 60)).padStart(2, "0")
                      : ""}
                  </span>
                ) : null}
              </button>
            ))}
            {loading
              ? Array.from({ length: 8 }, (_, index) => (
                  <span className="chat-gallery-skeleton" key={index} />
                ))
              : null}
          </div>
          {!loading && !media.length ? (
            <div className="chat-gallery-empty">
              <PhotoLibraryOutlinedIcon />
              <p>Choose photos or videos from your device.</p>
              <button type="button" onClick={() => void openIn()}>
                Open gallery
              </button>
            </div>
          ) : null}
          {more && !loading ? (
            <button
              type="button"
              className="chat-gallery-load"
              onClick={() => void loadPage(album)}
            >
              Load more
            </button>
          ) : null}
        </div>
        <footer>
          <button
            type="button"
            className="active"
            onClick={() => {
              setMenuOpen(false);
              if (native) {
                setExpanded(true);
                setAlbumsOpen((value) => !value);
              } else input.current?.click();
            }}
          >
            <PhotoLibraryOutlinedIcon />
            <span>Gallery</span>
          </button>
          <button type="button" onClick={onDocument} disabled={busy || reading}>
            <DescriptionOutlinedIcon />
            <span>File</span>
          </button>
          {selected ? (
            <button
              type="button"
              className="chat-gallery-next"
              disabled={busy || reading}
              onClick={() => void choose()}
            >
              {reading ? "Opening..." : "Next"}
            </button>
          ) : (
            <small>
              Photos 2 MB
              <br />
              Videos 2.5 MB
            </small>
          )}
        </footer>
        <input
          ref={input}
          className="chat-gallery-input"
          type="file"
          accept="image/*,video/*"
          multiple
          onChange={(event) => {
            chooseLocal(event.target.files);
            event.currentTarget.value = "";
          }}
        />
        <input
          ref={camera}
          className="chat-gallery-input"
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file && mounted.current) onChoose(file);
            event.currentTarget.value = "";
          }}
        />
      </div>
    </div>,
    document.body,
  );
}
