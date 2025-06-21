import * as pdfjsLib from "pdfjs-dist";

interface ThumbnailConfig {
  width: number;
  height: number;
  quality: number;
  videoSeekTime?: number;
}

type SupportedFileType = "image" | "video" | "pdf" | "unsupported";

export class ThumbnailGenerator {
  private config: ThumbnailConfig;

  static getFileType(file: File): SupportedFileType {
    if (file.type.startsWith("image/")) return "image";
    if (file.type.startsWith("video/")) return "video";
    if (file.type === "application/pdf") return "pdf";
    return "unsupported";
  }

  constructor(
    config: ThumbnailConfig = {
      width: 150,
      height: 150,
      quality: 0.8,
      videoSeekTime: 1,
    },
  ) {
    this.config = config;

    pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  }

  private drawImageToCanvas(
    source: HTMLImageElement | HTMLVideoElement,
    canvas: HTMLCanvasElement,
    ctx: CanvasRenderingContext2D,
  ): void {
    const sourceWidth =
      "videoWidth" in source ? source.videoWidth : source.width;
    const sourceHeight =
      "videoHeight" in source ? source.videoHeight : source.height;

    const { width: thumbWidth, height: thumbHeight } = this.config;

    // Calculate scaling to fit within thumbnail while maintaining aspect ratio
    const scale = Math.min(
      thumbWidth / sourceWidth,
      thumbHeight / sourceHeight,
    );
    const newWidth = sourceWidth * scale;
    const newHeight = sourceHeight * scale;

    // Center the image
    const offsetX = (thumbWidth - newWidth) / 2;
    const offsetY = (thumbHeight - newHeight) / 2;

    // ctx.fillStyle = "transparent";
    // ctx.fillRect(0, 0, thumbWidth, thumbHeight);

    // Draw the scaled image
    ctx.drawImage(source, offsetX, offsetY, newWidth, newHeight);
  }

  private scaleCanvasToThumbnail(
    sourceCanvas: HTMLCanvasElement,
    targetCanvas: HTMLCanvasElement,
    targetCtx: CanvasRenderingContext2D,
  ): void {
    const { width: thumbWidth, height: thumbHeight } = this.config;

    const scaleX = thumbWidth / sourceCanvas.width;
    const scaleY = thumbHeight / sourceCanvas.height;
    const scaleFit = Math.min(scaleX, scaleY);

    const newWidth = sourceCanvas.width * scaleFit;
    const newHeight = sourceCanvas.height * scaleFit;
    const offsetX = (thumbWidth - newWidth) / 2;
    const offsetY = (thumbHeight - newHeight) / 2;

    // targetCtx.fillStyle = "transparent";
    // targetCtx.fillRect(0, 0, thumbWidth, thumbHeight);

    // Draw scaled image
    targetCtx.drawImage(sourceCanvas, offsetX, offsetY, newWidth, newHeight);
  }

  private generateImageThumbnail(
    file: File,
    canvas: HTMLCanvasElement,
    ctx: CanvasRenderingContext2D,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);

      img.onload = (): void => {
        this.drawImageToCanvas(img, canvas, ctx);
        URL.revokeObjectURL(url);
        resolve();
      };

      img.onerror = (): void => {
        URL.revokeObjectURL(url);
        reject(new Error("Failed to load image"));
      };

      img.src = url;
    });
  }

  private generateVideoThumbnail(
    file: File,
    canvas: HTMLCanvasElement,
    ctx: CanvasRenderingContext2D,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const video = document.createElement("video");
      const url = URL.createObjectURL(file);

      video.onloadedmetadata = (): void => {
        const seekTime = Math.min(
          this.config.videoSeekTime || 1,
          video.duration * 0.1,
        );
        video.currentTime = seekTime;
      };

      video.onseeked = (): void => {
        this.drawImageToCanvas(video, canvas, ctx);
        URL.revokeObjectURL(url);
        resolve();
      };

      video.onerror = (): void => {
        URL.revokeObjectURL(url);
        reject(new Error("Failed to load video"));
      };

      video.src = url;
      video.load();
    });
  }

  private async generatePDFThumbnail(
    file: File,
    canvas: HTMLCanvasElement,
    ctx: CanvasRenderingContext2D,
  ): Promise<void> {
    try {
      const arrayBuffer = await file.arrayBuffer();

      const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
      const page = await pdf.getPage(1);

      const scale = 1.5;
      const viewport = page.getViewport({ scale });

      // Temporary canvas for full-size rendering
      const tempCanvas = document.createElement("canvas");
      const tempCtx = tempCanvas.getContext("2d");

      if (!tempCtx) {
        throw new Error("Failed to get temporary canvas context");
      }

      tempCanvas.width = viewport.width;
      tempCanvas.height = viewport.height;

      const renderContext = {
        canvasContext: tempCtx,
        viewport: viewport,
      };

      await page.render(renderContext).promise;

      // Scale down to thumbnail size
      this.scaleCanvasToThumbnail(tempCanvas, canvas, ctx);
    } catch (error) {
      throw new Error(
        `Failed to generate PDF thumbnail: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  async generate(file: File): Promise<Blob | null> {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    if (!ctx) throw new Error("Thumbnail canvas context is not available!");

    canvas.width = this.config.width;
    canvas.height = this.config.height;

    const fileType = ThumbnailGenerator.getFileType(file);

    try {
      switch (fileType) {
        case "image":
          await this.generateImageThumbnail(file, canvas, ctx);
          break;
        case "video":
          await this.generateVideoThumbnail(file, canvas, ctx);
          break;
        case "pdf":
          await this.generatePDFThumbnail(file, canvas, ctx);
          break;
        default:
          throw new Error(`Unsupported file type: ${file.type}`);
      }
    } catch {
      return null;
    }

    const thumbnail = await new Promise<Blob | null>((res) => {
      canvas.toBlob((blob) => res(blob), "image/png", this.config.quality);
    });

    if (!thumbnail) throw new Error("Could not generate thumbnail!");

    return thumbnail;
  }
}
