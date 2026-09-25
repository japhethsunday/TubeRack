import { test } from "node:test";
import assert from "node:assert/strict";
import { toStockItem } from "@/src/server/stock/pixabay";

test("stock: reads Pixabay videos and photos into one shape", () => {
  const v = toStockItem("video", {
    id: 125,
    tags: "city, night, traffic, lights",
    user: "Coverr",
    duration: 14,
    videos: { medium: { url: "https://cdn.pixabay.com/v/m.mp4", width: 1920, height: 1080, thumbnail: "https://cdn.pixabay.com/v/m.jpg" }, tiny: { url: "https://cdn.pixabay.com/v/t.mp4", width: 640, height: 360 } },
  });
  assert.equal(v?.id, "v125");
  assert.equal(v?.title, "City, night, traffic");
  assert.equal(v?.previewVideo, "https://cdn.pixabay.com/v/t.mp4");
  assert.equal(v?.durationSec, 14);
  const p = toStockItem("photo", { id: 9, tags: "desk", webformatURL: "https://pixabay.com/get/x.jpg", imageWidth: 4000, imageHeight: 3000 });
  assert.equal(p?.id, "p9");
  assert.equal(p?.previewVideo, null);
  assert.equal(toStockItem("video", { id: 1 }), null);
});
