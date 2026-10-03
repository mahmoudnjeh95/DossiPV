-- CreateTable
CREATE TABLE "pvgis_weather_cache" (
    "id" TEXT NOT NULL,
    "latRounded" DOUBLE PRECISION NOT NULL,
    "lonRounded" DOUBLE PRECISION NOT NULL,
    "tiltDeg" DOUBLE PRECISION NOT NULL,
    "azimuthDeg" DOUBLE PRECISION NOT NULL,
    "year" INTEGER NOT NULL,
    "inPlaneDataJson" JSONB NOT NULL,
    "horizontalDataJson" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pvgis_weather_cache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pvgis_weather_cache_latRounded_lonRounded_tiltDeg_azimuthDe_key" ON "pvgis_weather_cache"("latRounded", "lonRounded", "tiltDeg", "azimuthDeg", "year");
