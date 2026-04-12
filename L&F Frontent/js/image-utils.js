(function () {
  function fileToDataUrl(file) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = function () {
        resolve(typeof reader.result === "string" ? reader.result : "");
      };
      reader.onerror = function () {
        reject(new Error("Failed to read image"));
      };
      reader.readAsDataURL(file);
    });
  }

  function loadImageFromFile(file) {
    return new Promise(function (resolve, reject) {
      const image = new Image();
      image.onload = function () {
        resolve(image);
      };
      image.onerror = function () {
        reject(new Error("Failed to decode image"));
      };
      image.src = URL.createObjectURL(file);
    });
  }

  async function compressImageFile(file, options) {
    const settings = Object.assign({
      maxWidth: 1280,
      maxHeight: 1280,
      quality: 0.82,
      minCompressSizeBytes: 250 * 1024,
      outputType: "image/jpeg"
    }, options || {});

    if (!file || !(file instanceof File)) {
      throw new Error("Image file is required");
    }

    if (!file.type.startsWith("image/")) {
      throw new Error("Selected file is not an image");
    }

    if (file.size <= settings.minCompressSizeBytes) {
      return fileToDataUrl(file);
    }

    const image = await loadImageFromFile(file);
    const scale = Math.min(
      1,
      settings.maxWidth / image.width,
      settings.maxHeight / image.height
    );

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));

    const context = canvas.getContext("2d");
    if (!context) {
      return fileToDataUrl(file);
    }

    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    let compressed = "";
    try {
      compressed = canvas.toDataURL(settings.outputType, settings.quality);
    } catch (error) {
      compressed = "";
    } finally {
      URL.revokeObjectURL(image.src);
    }

    if (!compressed || compressed.length >= file.size * 1.37) {
      return fileToDataUrl(file);
    }

    return compressed;
  }

  async function createImageVariantSet(file, mainOptions, thumbOptions) {
    const fullImage = await compressImageFile(file, mainOptions || {});
    const thumbnail = await compressImageFile(file, Object.assign({
      maxWidth: 420,
      maxHeight: 420,
      quality: 0.72,
      minCompressSizeBytes: 0
    }, thumbOptions || {}));

    return {
      image: fullImage,
      imageThumb: thumbnail
    };
  }

  window.LFImageUtils = {
    fileToDataUrl: fileToDataUrl,
    compressImageFile: compressImageFile,
    createImageVariantSet: createImageVariantSet
  };
}());
