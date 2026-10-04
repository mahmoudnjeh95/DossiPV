import type Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

export interface Page37Point {
  lat: number;
  lon: number;
}

export interface Page37Points {
  technicalRoom: Page37Point | null;
  meter: Page37Point | null;
  earthPit: Page37Point | null;
}

export interface Page37LayoutInput {
  satelliteImage: Buffer;
  points: Page37Points;
}

export interface Page37Layout {
  panelRectangle: Page37Point[];
  wireRoute: Page37Point[];
}

const pointSchema = z.object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) });
const page37LayoutSchema = z.object({
  panelRectangle: z.array(pointSchema),
  wireRoute: z.array(pointSchema),
});

export class Page37LayoutParseError extends Error {
  constructor(reason: string) {
    super(`Claude did not return a valid page-37 layout: ${reason}`);
    this.name = 'Page37LayoutParseError';
  }
}

const page37OutputFormat = {
  type: 'json_schema' as const,
  schema: {
    type: 'object',
    properties: {
      panelRectangle: {
        type: 'array',
        items: { type: 'object', properties: { lat: { type: 'number' }, lon: { type: 'number' } }, required: ['lat', 'lon'], additionalProperties: false },
      },
      wireRoute: {
        type: 'array',
        items: { type: 'object', properties: { lat: { type: 'number' }, lon: { type: 'number' } }, required: ['lat', 'lon'], additionalProperties: false },
      },
    },
    required: ['panelRectangle', 'wireRoute'],
    additionalProperties: false,
  },
};

function describePoints(points: Page37Points): string {
  const lines: string[] = [];
  if (points.technicalRoom) lines.push(`Local technique : lat=${points.technicalRoom.lat}, lon=${points.technicalRoom.lon}`);
  if (points.meter) lines.push(`Compteur : lat=${points.meter.lat}, lon=${points.meter.lon}`);
  if (points.earthPit) lines.push(`Prise de terre : lat=${points.earthPit.lat}, lon=${points.earthPit.lon}`);
  return lines.join('\n');
}

/**
 * Sends the site's satellite image plus the installer-placed points to claude-sonnet-5-5 and
 * asks it to reason about where solar panels should sit on the roof/ground and how the DC/AC
 * wiring should route between the array and the given points. Claude's Messages API has no
 * image-generation output — it returns structured lat/lon coordinates here, which the caller
 * (render-page-37-38.ts) then draws onto the same satellite image deterministically.
 */
export async function generatePage37Layout(input: Page37LayoutInput, client: Anthropic): Promise<Page37Layout> {
  const response = await client.messages.parse({
    model: 'claude-sonnet-5-5',
    max_tokens: 2048,
    system:
      "Tu analyses une image satellite d'un site pour une installation photovoltaïque. On te donne les coordonnées GPS de certains points du site (local technique, compteur, prise de terre). Propose l'emplacement d'un champ de panneaux solaires sur le toit ou le terrain visible sur l'image (un rectangle à 4 coins, en coordonnées GPS), et un tracé de câblage reliant ce champ aux points donnés (une liste ordonnée de coordonnées GPS). Réponds uniquement avec les coordonnées demandées, sans texte additionnel.",
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: input.satelliteImage.toString('base64') } },
          { type: 'text', text: describePoints(input.points) },
        ],
      },
    ],
    output_config: { format: page37OutputFormat },
  });

  if (response.parsed_output === null) {
    throw new Page37LayoutParseError('no parsed_output in response');
  }

  const parseResult = page37LayoutSchema.safeParse(response.parsed_output);
  if (!parseResult.success) {
    throw new Page37LayoutParseError(parseResult.error.message);
  }

  return parseResult.data;
}
