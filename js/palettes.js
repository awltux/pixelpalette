/*
   Pixel Palette - colour picker & paint mixer
   Copyright (C) 2026 Awltux Limited

   This program is free software: you can redistribute it and/or modify
   it under the terms of the GNU Affero General Public License as published
   by the Free Software Foundation, either version 3 of the License, or
   (at your option) any later version.

   This program is distributed in the hope that it will be useful,
   but WITHOUT ANY WARRANTY; without even the implied warranty of
   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
   GNU Affero General Public License for more details.

   You should have received a copy of the GNU Affero General Public License
   along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

/* ============================================================
   palettes.js - default palettes per medium + persistence.
   Paint model: { name, hex, brand, strength, opacity, ci,
                  lightfast, undertone, granulating, staining,
                  toxic }.
   Medium adds type/opacity/paper + artist readouts (drying,
   sheen, diluent, wet-workability).
   ============================================================ */
(function (global) {
  'use strict';

  const P = (name, hex, brand, o) => Object.assign({
    name, hex, brand,
    strength: 1, opacity: 100, ci: '', lightfast: 'II', undertone: hex,
    granulating: false, staining: 'None', toxic: false,
  }, o || {});

  /* expanded-range paints: present in the palette's full selection but
     disabled by default (the editor can enable any of them) */
  const X = (name, hex, brand, o) => P(name, hex, brand, Object.assign({ enabled: false }, o || {}));

  const MEDIA = {
    oil: { id: 'oil', type: 'opaque', opacity: 0.96, paper: '#F7F3E9', label: 'Oil', dryingTime: 'slow', sheen: 'glossy', diluent: 'oil', wetWork: 'wet-in-wet' },
    acrylic: { id: 'acrylic', type: 'opaque', opacity: 0.97, paper: '#FCFCFC', label: 'Acrylic', dryingTime: 'fast', sheen: 'satin', diluent: 'water', wetWork: 'wet-in-wet' },
    gouache: { id: 'gouache', type: 'opaque', opacity: 0.9, paper: '#FFFFFF', label: 'Gouache', dryingTime: 'fast', sheen: 'matte', diluent: 'water', wetWork: 'wet-on-dry' },
    pencil: { id: 'pencil', type: 'opaque', opacity: 0.82, paper: '#FFFFFF', label: 'Pencils', dryingTime: 'instant', sheen: 'matte', diluent: 'dry', wetWork: 'wet-on-dry' },
    watercolour: { id: 'watercolour', type: 'glaze', opacity: 1, paper: '#FDFDFD', label: 'Watercolour', dryingTime: 'fast', sheen: 'matte', diluent: 'water', wetWork: 'wet-in-wet' },
  };

  const DEFAULTS = {
    oil: [
      P('Titanium White', '#FBFBFB', 'W&N', { opacity: 100, ci: 'PW6', lightfast: 'I' }),
      P('Cadmium Yellow Light', '#F6C900', 'W&N', { strength: 1.1, opacity: 90, ci: 'PY35', lightfast: 'I', toxic: true }),
      P('Cadmium Orange', '#F97306', 'W&N', { strength: 1.2, opacity: 90, ci: 'PO20', lightfast: 'I', toxic: true }),
      P('Cadmium Red', '#E62300', 'W&N', { strength: 1.2, opacity: 92, ci: 'PR108', lightfast: 'I', undertone: '#E8620B', toxic: true }),
      P('Alizarin Crimson', '#A4203A', 'W&N', { strength: 1.6, opacity: 40, ci: 'PR83', lightfast: 'III', undertone: '#B0224E' }),
      P('Quinacridone Rose', '#D63C9B', 'W&N', { strength: 2.0, opacity: 45, ci: 'PV19', lightfast: 'I' }),
      P('Dioxazine Purple', '#5B2A86', 'W&N', { strength: 2.2, opacity: 55, ci: 'PV23', lightfast: 'II' }),
      P('Ultramarine Blue', '#2641A4', 'W&N', { strength: 1.3, opacity: 65, ci: 'PB29', lightfast: 'I', undertone: '#2F50B8' }),
      P('Cerulean Blue', '#007BB8', 'W&N', { strength: 0.8, opacity: 90, ci: 'PB35', lightfast: 'I', toxic: true }),
      P('Phthalo Blue', '#0B5E97', 'W&N', { strength: 2.5, opacity: 40, ci: 'PB15', lightfast: 'I', undertone: '#0A7A90' }),
      P('Viridian', '#007C61', 'W&N', { strength: 1.5, opacity: 45, ci: 'PG18', lightfast: 'I' }),
      P('Sap Green', '#7A9B31', 'W&N', { strength: 0.9, opacity: 55, ci: 'PY129', lightfast: 'III' }),
      P('Yellow Ochre', '#B7791F', 'W&N', { strength: 0.6, opacity: 85, ci: 'PY43', lightfast: 'I' }),
      P('Burnt Sienna', '#98552F', 'W&N', { strength: 0.8, opacity: 75, ci: 'PBr7', lightfast: 'II', undertone: '#C67A3D' }),
      P('Burnt Umber', '#43322B', 'W&N', { strength: 0.9, opacity: 80, ci: 'PBr7', lightfast: 'II' }),
      P('Ivory Black', '#2C2C2C', 'W&N', { strength: 2.0, opacity: 90, ci: 'PBk9', lightfast: 'I' }),
      X('Zinc White', '#F0F2F0', 'W&N', { strength: 0.4, opacity: 80, ci: 'PW4', lightfast: 'I' }),
      X('Flake White', '#E6E1D4', 'W&N', { strength: 0.5, opacity: 95, ci: 'PW1', lightfast: 'I' }),
      X('Titanium Buff', '#D4C8AA', 'W&N', { strength: 0.4, opacity: 85, ci: 'PW6/PBr24', lightfast: 'I' }),
      X('Naples Yellow', '#E7C96E', 'W&N', { strength: 0.5, opacity: 80, ci: 'PY41', lightfast: 'I' }),
      X('Cadmium Lemon', '#F5E94A', 'W&N', { strength: 1.1, opacity: 90, ci: 'PY35', lightfast: 'I', toxic: true }),
      X('Cadmium Yellow Deep', '#F2A51F', 'W&N', { strength: 1.1, opacity: 90, ci: 'PY35', lightfast: 'I', undertone: '#E8951A', toxic: true }),
      X('Winsor Yellow', '#F0C21C', 'W&N', { strength: 1.4, opacity: 50, ci: 'PY154', lightfast: 'I' }),
      X('Indian Yellow', '#D6941F', 'W&N', { strength: 1.2, opacity: 65, ci: 'PY110', lightfast: 'II' }),
      X('Cadmium Scarlet', '#E2331A', 'W&N', { strength: 1.2, opacity: 90, ci: 'PR108', lightfast: 'I', undertone: '#E8590F', toxic: true }),
      X('Pyrrole Red', '#D42620', 'W&N', { strength: 1.6, opacity: 85, ci: 'PR254', lightfast: 'I', undertone: '#C13A28' }),
      X('Cadmium Red Deep', '#B51D13', 'W&N', { strength: 1.2, opacity: 92, ci: 'PR108', lightfast: 'I', undertone: '#9E1A12', toxic: true }),
      X('Permanent Magenta', '#B62A72', 'W&N', { strength: 2.2, opacity: 45, ci: 'PV19', lightfast: 'I' }),
      X('Quinacridone Magenta', '#A2276A', 'W&N', { strength: 2.2, opacity: 50, ci: 'PR122', lightfast: 'I' }),
      X('Cobalt Violet', '#8C4EA0', 'W&N', { strength: 0.9, opacity: 75, ci: 'PV14', lightfast: 'I', toxic: true }),
      X('Ultramarine Violet', '#5D4D8C', 'W&N', { strength: 1.0, opacity: 70, ci: 'PV15', lightfast: 'I' }),
      X('Winsor Violet', '#64377F', 'W&N', { strength: 2.0, opacity: 55, ci: 'PV23', lightfast: 'II' }),
      X('Indanthrone Blue', '#18316E', 'W&N', { strength: 2.2, opacity: 60, ci: 'PB60', lightfast: 'I' }),
      X('Prussian Blue', '#0B3B57', 'W&N', { strength: 2.4, opacity: 65, ci: 'PB27', lightfast: 'I', undertone: '#0A5A4A' }),
      X('Manganese Blue Hue', '#1284B4', 'W&N', { strength: 1.0, opacity: 85, ci: 'PB15:3', lightfast: 'I' }),
      X('Cobalt Teal', '#33B6C9', 'W&N', { strength: 0.9, opacity: 80, ci: 'PG50', lightfast: 'I' }),
      X('Cobalt Turquoise', '#16A3AC', 'W&N', { strength: 1.0, opacity: 80, ci: 'PG50', lightfast: 'I', toxic: true }),
      X('Phthalo Green', '#147A5A', 'W&N', { strength: 2.5, opacity: 45, ci: 'PG7', lightfast: 'I', undertone: '#0A6E6E' }),
      X('Cadmium Green', '#2E7D3A', 'W&N', { strength: 1.2, opacity: 85, ci: 'PG50', lightfast: 'II', toxic: true }),
      X('Yellow Green', '#7C9B30', 'W&N', { strength: 1.0, opacity: 70, ci: 'PY129/PG7', lightfast: 'II' }),
      X('Green Gold', '#A89A3A', 'W&N', { strength: 1.0, opacity: 60, ci: 'PY129', lightfast: 'I' }),
      X('Raw Sienna', '#A96F36', 'W&N', { strength: 0.6, opacity: 85, ci: 'PBr7', lightfast: 'I' }),
      X('Raw Umber', '#6B5233', 'W&N', { strength: 0.8, opacity: 85, ci: 'PBr7', lightfast: 'I' }),
      X('Transparent Oxide Red', '#9C3D26', 'W&N', { strength: 1.0, opacity: 70, ci: 'PR101', lightfast: 'I' }),
      X('Van Dyke Brown', '#45331F', 'W&N', { strength: 1.2, opacity: 85, ci: 'PBr8', lightfast: 'II' }),
      X('Terre Verte', '#5B6853', 'W&N', { strength: 0.5, opacity: 80, ci: 'PG23', lightfast: 'I', granulating: true }),
    ],
    acrylic: [
      P('Titanium White', '#FFFFFF', 'Golden', { opacity: 100, ci: 'PW6', lightfast: 'I' }),
      P('Cadmium Yellow Medium', '#F4C423', 'Golden', { strength: 1.1, opacity: 90, ci: 'PY35', lightfast: 'I', toxic: true }),
      P('Cadmium Orange', '#F97F0B', 'Golden', { strength: 1.2, opacity: 90, ci: 'PO20', lightfast: 'I', toxic: true }),
      P('Cadmium Red Medium', '#E32712', 'Golden', { strength: 1.2, opacity: 92, ci: 'PR108', lightfast: 'I', undertone: '#E8640E', toxic: true }),
      P('Quinacridone Crimson', '#8E1B3F', 'Golden', { strength: 1.9, opacity: 40, ci: 'PR206', lightfast: 'I' }),
      P('Dioxazine Purple', '#5B2A86', 'Golden', { strength: 2.2, opacity: 55, ci: 'PV23', lightfast: 'II' }),
      P('Ultramarine Blue', '#1F3A93', 'Golden', { strength: 1.3, opacity: 65, ci: 'PB29', lightfast: 'I', undertone: '#2741A6' }),
      P('Cobalt Blue', '#0F5B9C', 'Golden', { strength: 0.9, opacity: 75, ci: 'PB28', lightfast: 'I', toxic: true }),
      P('Phthalo Blue (GS)', '#093B6D', 'Golden', { strength: 2.6, opacity: 40, ci: 'PB15', lightfast: 'I', undertone: '#0A4E7E' }),
      P('Phthalo Green (YS)', '#0E7B4E', 'Golden', { strength: 2.5, opacity: 40, ci: 'PG7', lightfast: 'I', undertone: '#1E8A4F' }),
      P('Sap Green', '#6E8B2C', 'Golden', { strength: 0.9, opacity: 55, ci: 'PY129', lightfast: 'III' }),
      P('Yellow Oxide', '#C58A2E', 'Golden', { strength: 0.6, opacity: 85, ci: 'PY42', lightfast: 'I' }),
      P('Naphthol Red', '#D02418', 'Golden', { strength: 1.4, opacity: 85, ci: 'PR112', lightfast: 'II' }),
      P('Burnt Sienna', '#9A4E2A', 'Golden', { strength: 0.8, opacity: 75, ci: 'PBr7', lightfast: 'II', undertone: '#C77A3C' }),
      P('Carbon Black', '#1C1C1C', 'Golden', { strength: 2.0, opacity: 92, ci: 'PBk7', lightfast: 'I' }),
      X('Zinc White', '#F1F3F1', 'Golden', { strength: 0.4, opacity: 80, ci: 'PW4', lightfast: 'I' }),
      X('Titanium Buff', '#D5C9AC', 'Golden', { strength: 0.4, opacity: 85, ci: 'PW6/PBr24', lightfast: 'I' }),
      X('Naples Yellow', '#E9C76F', 'Golden', { strength: 0.5, opacity: 80, ci: 'PY41', lightfast: 'I' }),
      X('Cadmium Lemon', '#F3E94C', 'Golden', { strength: 1.1, opacity: 90, ci: 'PY35', lightfast: 'I', toxic: true }),
      X('Cadmium Yellow Deep', '#F0A51F', 'Golden', { strength: 1.1, opacity: 90, ci: 'PY35', lightfast: 'I', undertone: '#E8971B', toxic: true }),
      X('Azo Yellow Medium', '#F0C12A', 'Golden', { strength: 1.0, opacity: 75, ci: 'PY74', lightfast: 'II' }),
      X('Indian Yellow', '#D89723', 'Golden', { strength: 1.2, opacity: 70, ci: 'PY110', lightfast: 'II' }),
      X('Cadmium Scarlet', '#E0331D', 'Golden', { strength: 1.2, opacity: 92, ci: 'PR108', lightfast: 'I', undertone: '#E85A10', toxic: true }),
      X('Pyrrole Red', '#D2261F', 'Golden', { strength: 1.6, opacity: 85, ci: 'PR254', lightfast: 'I', undertone: '#C23A29' }),
      X('Cadmium Red Deep', '#B71F14', 'Golden', { strength: 1.2, opacity: 92, ci: 'PR108', lightfast: 'I', undertone: '#9F1B12', toxic: true }),
      X('Quinacridone Magenta', '#A5286C', 'Golden', { strength: 2.2, opacity: 50, ci: 'PR122', lightfast: 'I' }),
      X('Permanent Magenta', '#B62C74', 'Golden', { strength: 2.2, opacity: 45, ci: 'PV19', lightfast: 'I' }),
      X('Dioxazine Violet', '#5C2A6E', 'Golden', { strength: 2.2, opacity: 55, ci: 'PV23', lightfast: 'II' }),
      X('Cobalt Violet', '#8D4FA1', 'Golden', { strength: 0.9, opacity: 75, ci: 'PV14', lightfast: 'I', toxic: true }),
      X('Ultramarine Violet', '#5E4F90', 'Golden', { strength: 1.0, opacity: 70, ci: 'PV15', lightfast: 'I' }),
      X('Indanthrone Blue', '#1A3472', 'Golden', { strength: 2.2, opacity: 60, ci: 'PB60', lightfast: 'I' }),
      X('Prussian Blue', '#0C3D5A', 'Golden', { strength: 2.4, opacity: 65, ci: 'PB27', lightfast: 'I', undertone: '#0A5B4B' }),
      X('Manganese Blue Hue', '#1585B5', 'Golden', { strength: 1.0, opacity: 85, ci: 'PB15', lightfast: 'I' }),
      X('Cobalt Teal', '#37B7C9', 'Golden', { strength: 0.9, opacity: 80, ci: 'PG50', lightfast: 'I' }),
      X('Cobalt Turquoise', '#17A4AC', 'Golden', { strength: 1.0, opacity: 80, ci: 'PG50', lightfast: 'I', toxic: true }),
      X('Phthalo Green', '#147B5C', 'Golden', { strength: 2.6, opacity: 45, ci: 'PG7', lightfast: 'I', undertone: '#0B6F6F' }),
      X('Cadmium Green', '#2F7F3C', 'Golden', { strength: 1.2, opacity: 85, ci: 'PG50', lightfast: 'II', toxic: true }),
      X('Yellow Green', '#7E9D33', 'Golden', { strength: 1.0, opacity: 70, ci: 'PY129', lightfast: 'II' }),
      X('Green Gold', '#AB9B3C', 'Golden', { strength: 1.0, opacity: 60, ci: 'PY129', lightfast: 'I' }),
      X('Raw Sienna', '#AA7138', 'Golden', { strength: 0.6, opacity: 85, ci: 'PBr7', lightfast: 'I' }),
      X('Raw Umber', '#6C5434', 'Golden', { strength: 0.8, opacity: 85, ci: 'PBr7', lightfast: 'I' }),
      X('Transparent Oxide Red', '#9E3F27', 'Golden', { strength: 1.0, opacity: 70, ci: 'PR101', lightfast: 'I' }),
      X('Van Dyke Brown', '#463422', 'Golden', { strength: 1.2, opacity: 85, ci: 'PBr8', lightfast: 'II' }),
    ],
    gouache: [
      P('Titanium White', '#FFFFFF', 'Schmincke', { opacity: 100, ci: 'PW6', lightfast: 'I' }),
      P('Lemon Yellow', '#F5DE0A', 'Schmincke', { strength: 1.0, opacity: 85, ci: 'PY3', lightfast: 'I' }),
      P('Cadmium Yellow', '#F9B900', 'Schmincke', { strength: 1.1, opacity: 90, ci: 'PY35', lightfast: 'I', toxic: true }),
      P('Cadmium Orange', '#F97A00', 'Schmincke', { strength: 1.2, opacity: 90, ci: 'PO20', lightfast: 'I', toxic: true }),
      P('Cadmium Red', '#E32900', 'Schmincke', { strength: 1.2, opacity: 92, ci: 'PR108', lightfast: 'I', undertone: '#E7620B', toxic: true }),
      P('Permanent Carmine', '#B01B45', 'Schmincke', { strength: 1.7, opacity: 75, ci: 'PR177', lightfast: 'II' }),
      P('Dioxazine Purple', '#5B2A86', 'Schmincke', { strength: 2.0, opacity: 60, ci: 'PV23', lightfast: 'II' }),
      P('Ultramarine Blue', '#2A3F9E', 'Schmincke', { strength: 1.3, opacity: 70, ci: 'PB29', lightfast: 'I', undertone: '#2F4AB0' }),
      P('Cerulean Blue', '#0087BD', 'Schmincke', { strength: 0.8, opacity: 90, ci: 'PB35', lightfast: 'I', toxic: true }),
      P('Cobalt Blue', '#0D4E92', 'Schmincke', { strength: 0.9, opacity: 80, ci: 'PB28', lightfast: 'I', toxic: true }),
      P('Phthalo Green', '#007D5C', 'Schmincke', { strength: 2.5, opacity: 45, ci: 'PG7', lightfast: 'I', undertone: '#0E8A5E' }),
      P('Sap Green', '#6E9B2B', 'Schmincke', { strength: 0.9, opacity: 60, ci: 'PY129', lightfast: 'III' }),
      P('Yellow Ochre', '#C88A2D', 'Schmincke', { strength: 0.6, opacity: 85, ci: 'PY43', lightfast: 'I' }),
      P('Burnt Sienna', '#A04E24', 'Schmincke', { strength: 0.8, opacity: 80, ci: 'PBr7', lightfast: 'II', undertone: '#C87B3C' }),
      P('Ivory Black', '#262626', 'Schmincke', { strength: 2.0, opacity: 92, ci: 'PBk9', lightfast: 'I' }),
      X('Zinc White', '#F1F3F1', 'Schmincke', { strength: 0.4, opacity: 80, ci: 'PW4', lightfast: 'I' }),
      X('Titanium Buff', '#D4C8AB', 'Schmincke', { strength: 0.4, opacity: 85, ci: 'PW6/PBr24', lightfast: 'I' }),
      X('Naples Yellow', '#E8C670', 'Schmincke', { strength: 0.5, opacity: 80, ci: 'PY41', lightfast: 'I' }),
      X('Cadmium Lemon', '#F4E94D', 'Schmincke', { strength: 1.1, opacity: 90, ci: 'PY35', lightfast: 'I', toxic: true }),
      X('Cadmium Yellow Deep', '#F0A420', 'Schmincke', { strength: 1.1, opacity: 90, ci: 'PY35', lightfast: 'I', undertone: '#E8961B', toxic: true }),
      X('Azo Yellow', '#EFC12B', 'Schmincke', { strength: 1.0, opacity: 75, ci: 'PY74', lightfast: 'II' }),
      X('Indian Yellow', '#D69421', 'Schmincke', { strength: 1.2, opacity: 70, ci: 'PY110', lightfast: 'II' }),
      X('Cadmium Scarlet', '#DF321B', 'Schmincke', { strength: 1.2, opacity: 90, ci: 'PR108', lightfast: 'I', undertone: '#E75A10', toxic: true }),
      X('Pyrrole Red', '#D2251E', 'Schmincke', { strength: 1.6, opacity: 85, ci: 'PR254', lightfast: 'I', undertone: '#C23A28' }),
      X('Cadmium Red Deep', '#B51D12', 'Schmincke', { strength: 1.2, opacity: 92, ci: 'PR108', lightfast: 'I', undertone: '#9E1A12', toxic: true }),
      X('Quinacridone Magenta', '#A5296C', 'Schmincke', { strength: 2.2, opacity: 50, ci: 'PR122', lightfast: 'I' }),
      X('Cobalt Violet', '#8C4E9F', 'Schmincke', { strength: 0.9, opacity: 75, ci: 'PV14', lightfast: 'I', toxic: true }),
      X('Ultramarine Violet', '#5E4D8F', 'Schmincke', { strength: 1.0, opacity: 70, ci: 'PV15', lightfast: 'I' }),
      X('Indanthrone Blue', '#193470', 'Schmincke', { strength: 2.2, opacity: 60, ci: 'PB60', lightfast: 'I' }),
      X('Prussian Blue', '#0C3D5B', 'Schmincke', { strength: 2.4, opacity: 65, ci: 'PB27', lightfast: 'I', undertone: '#0A5B4B' }),
      X('Manganese Blue Hue', '#1584B4', 'Schmincke', { strength: 1.0, opacity: 85, ci: 'PB15', lightfast: 'I' }),
      X('Cobalt Teal', '#36B6C8', 'Schmincke', { strength: 0.9, opacity: 80, ci: 'PG50', lightfast: 'I' }),
      X('Phthalo Green', '#157B5C', 'Schmincke', { strength: 2.5, opacity: 45, ci: 'PG7', lightfast: 'I', undertone: '#0B6F6F' }),
      X('Cadmium Green', '#2E7E3B', 'Schmincke', { strength: 1.2, opacity: 85, ci: 'PG50', lightfast: 'II', toxic: true }),
      X('Yellow Green', '#7D9C32', 'Schmincke', { strength: 1.0, opacity: 70, ci: 'PY129', lightfast: 'II' }),
      X('Green Gold', '#AA9A3B', 'Schmincke', { strength: 1.0, opacity: 60, ci: 'PY129', lightfast: 'I' }),
      X('Raw Sienna', '#A97037', 'Schmincke', { strength: 0.6, opacity: 85, ci: 'PBr7', lightfast: 'I' }),
      X('Raw Umber', '#6C5333', 'Schmincke', { strength: 0.8, opacity: 85, ci: 'PBr7', lightfast: 'I' }),
      X('Transparent Oxide Red', '#9D3E26', 'Schmincke', { strength: 1.0, opacity: 70, ci: 'PR101', lightfast: 'I' }),
      X('Van Dyke Brown', '#453320', 'Schmincke', { strength: 1.2, opacity: 85, ci: 'PBr8', lightfast: 'II' }),
      X('Terre Verte', '#5A6752', 'Schmincke', { strength: 0.5, opacity: 80, ci: 'PG23', lightfast: 'I', granulating: true }),
    ],
    pencil: [
      P('White', '#F8F8F8', 'Faber-Castell', { strength: 0.5, opacity: 80 }),
      P('Lemon Yellow', '#F6E40B', 'Faber-Castell', { strength: 1.0, opacity: 70 }),
      P('Orange', '#F78B1E', 'Faber-Castell', { strength: 1.2, opacity: 75 }),
      P('Red', '#E32918', 'Faber-Castell', { strength: 1.2, opacity: 80, undertone: '#E8620B' }),
      P('Crimson', '#B2124A', 'Faber-Castell', { strength: 1.5, opacity: 70, undertone: '#C02456' }),
      P('Magenta', '#D3238B', 'Faber-Castell', { strength: 1.8, opacity: 70 }),
      P('Violet', '#6C2E99', 'Faber-Castell', { strength: 1.6, opacity: 75 }),
      P('Deep Violet', '#4B2E83', 'Faber-Castell', { strength: 1.9, opacity: 80 }),
      P('Ultramarine', '#2744A8', 'Faber-Castell', { strength: 1.3, opacity: 75, undertone: '#2B49B4' }),
      P('Phthalo Blue', '#0E4E9C', 'Faber-Castell', { strength: 2.2, opacity: 60, undertone: '#0E5E8C' }),
      P('Turquoise', '#12A2B0', 'Faber-Castell', { strength: 1.4, opacity: 65 }),
      P('Yellow Green', '#9ACD32', 'Faber-Castell', { strength: 1.0, opacity: 70 }),
      P('Grass Green', '#3C9B33', 'Faber-Castell', { strength: 1.4, opacity: 70 }),
      P('Dark Green', '#1E6B46', 'Faber-Castell', { strength: 1.6, opacity: 75 }),
      P('Burnt Ochre', '#B56A28', 'Faber-Castell', { strength: 0.7, opacity: 80 }),
      P('Sepia', '#5B3A22', 'Faber-Castell', { strength: 0.9, opacity: 80 }),
      P('Black', '#1A1A1A', 'Faber-Castell', { strength: 2.0, opacity: 90 }),
      X('Cadmium Yellow Pale', '#F7E663', 'Faber-Castell', { strength: 1.0, opacity: 75 }),
      X('Naples Yellow', '#E6C774', 'Faber-Castell', { strength: 0.5, opacity: 75 }),
      X('Golden Yellow', '#F2B91E', 'Faber-Castell', { strength: 1.1, opacity: 80 }),
      X('Deep Orange', '#E8760D', 'Faber-Castell', { strength: 1.3, opacity: 80 }),
      X('Vermilion', '#E33B1A', 'Faber-Castell', { strength: 1.2, opacity: 85 }),
      X('Deep Red', '#8E1A22', 'Faber-Castell', { strength: 1.6, opacity: 85 }),
      X('Pink', '#E88FB4', 'Faber-Castell', { strength: 0.8, opacity: 65 }),
      X('Rose', '#D95A92', 'Faber-Castell', { strength: 1.3, opacity: 70 }),
      X('Violet Blue', '#5A4A9C', 'Faber-Castell', { strength: 1.6, opacity: 80 }),
      X('True Blue', '#2446A0', 'Faber-Castell', { strength: 1.4, opacity: 80 }),
      X('Cerulean', '#2F9BC2', 'Faber-Castell', { strength: 1.0, opacity: 80 }),
      X('Sky Blue', '#6FBFD6', 'Faber-Castell', { strength: 0.8, opacity: 70 }),
      X('Peacock Blue', '#0F6B94', 'Faber-Castell', { strength: 1.7, opacity: 85 }),
      X('Sea Green', '#1F9C8A', 'Faber-Castell', { strength: 1.2, opacity: 80 }),
      X('Leaf Green', '#6FB13D', 'Faber-Castell', { strength: 1.1, opacity: 80 }),
      X('Olive Green', '#7A7A2E', 'Faber-Castell', { strength: 1.2, opacity: 85 }),
      X('Juniper Green', '#2F6E4F', 'Faber-Castell', { strength: 1.5, opacity: 85 }),
      X('Light Umber', '#A6784A', 'Faber-Castell', { strength: 0.7, opacity: 85 }),
      X('Burnt Sienna', '#9E4F26', 'Faber-Castell', { strength: 0.9, opacity: 85 }),
      X('Frost Blue', '#AFCBE0', 'Faber-Castell', { strength: 0.6, opacity: 65 }),
      X('Grey Green', '#7C8570', 'Faber-Castell', { strength: 1.0, opacity: 80 }),
      X('Cool Grey', '#6E7580', 'Faber-Castell', { strength: 1.0, opacity: 80 }),
      X('Warm Grey', '#8A8178', 'Faber-Castell', { strength: 1.0, opacity: 80 }),
    ],
    watercolour: [
      P('Lemon Yellow', '#F7E42A', 'W&N', { strength: 1.0, opacity: 15, ci: 'PY3', lightfast: 'I', staining: 'Low' }),
      P('Cadmium Yellow', '#F6BE00', 'W&N', { strength: 1.0, opacity: 25, ci: 'PY35', lightfast: 'I', staining: 'Low', toxic: true }),
      P('Cadmium Red', '#E53A1F', 'W&N', { strength: 1.1, opacity: 25, ci: 'PR108', lightfast: 'I', undertone: '#E8620B', staining: 'Medium', toxic: true }),
      P('Permanent Rose', '#E33E7E', 'W&N', { strength: 2.0, opacity: 15, ci: 'PV19', lightfast: 'I', staining: 'High' }),
      P('Alizarin Crimson', '#A8233F', 'W&N', { strength: 1.7, opacity: 15, ci: 'PR83', lightfast: 'III', undertone: '#B0224E', staining: 'High' }),
      P('French Ultramarine', '#2F3E9E', 'W&N', { strength: 1.3, opacity: 15, ci: 'PB29', lightfast: 'I', granulating: true, staining: 'Low' }),
      P('Cerulean Blue', '#1E8DC7', 'W&N', { strength: 0.8, opacity: 35, ci: 'PB35', lightfast: 'I', granulating: true, staining: 'Low', toxic: true }),
      P('Cobalt Blue', '#2358A6', 'W&N', { strength: 0.9, opacity: 20, ci: 'PB28', lightfast: 'I', granulating: true, staining: 'Low', toxic: true }),
      P('Winsor Blue (GS)', '#0E2E5E', 'W&N', { strength: 2.5, opacity: 15, ci: 'PB15', lightfast: 'I', undertone: '#0E4E7E', staining: 'High' }),
      P('Phthalo Green', '#0E7E59', 'W&N', { strength: 2.5, opacity: 15, ci: 'PG7', lightfast: 'I', undertone: '#1E8A5E', staining: 'High' }),
      P('Viridian', '#0A6E5F', 'W&N', { strength: 1.6, opacity: 15, ci: 'PG18', lightfast: 'I', granulating: true, staining: 'Low' }),
      P('Sap Green', '#6C8F2A', 'W&N', { strength: 0.9, opacity: 20, ci: 'PY129', lightfast: 'III', staining: 'Medium' }),
      P('Yellow Ochre', '#C58B2F', 'W&N', { strength: 0.6, opacity: 25, ci: 'PY43', lightfast: 'I', granulating: true, staining: 'Low' }),
      P('Raw Sienna', '#B0713A', 'W&N', { strength: 0.7, opacity: 25, ci: 'PY43', lightfast: 'I', staining: 'Medium' }),
      P('Burnt Sienna', '#95421F', 'W&N', { strength: 0.9, opacity: 20, ci: 'PBr7', lightfast: 'II', undertone: '#C0673A', staining: 'Medium' }),
      P('Payne\'s Grey', '#3A4464', 'W&N', { strength: 1.4, opacity: 25, ci: 'PBk6', lightfast: 'II', staining: 'Medium' }),
      X('Naples Yellow', '#E9C875', 'W&N', { strength: 0.5, opacity: 30, ci: 'PY41', lightfast: 'I', staining: 'Low' }),
      X('Cadmium Lemon', '#F4E94E', 'W&N', { strength: 1.0, opacity: 25, ci: 'PY35', lightfast: 'I', staining: 'Low', toxic: true }),
      X('Cadmium Yellow Deep', '#F0A321', 'W&N', { strength: 1.0, opacity: 30, ci: 'PY35', lightfast: 'I', undertone: '#E8961B', staining: 'Low', toxic: true }),
      X('Winsor Yellow', '#F0C11C', 'W&N', { strength: 1.4, opacity: 20, ci: 'PY154', lightfast: 'I', staining: 'Medium' }),
      X('Indian Yellow', '#D79423', 'W&N', { strength: 1.2, opacity: 25, ci: 'PY110', lightfast: 'II', staining: 'Low' }),
      X('Cadmium Scarlet', '#DF321C', 'W&N', { strength: 1.1, opacity: 25, ci: 'PR108', lightfast: 'I', undertone: '#E75A10', staining: 'Medium', toxic: true }),
      X('Pyrrole Red', '#D2261F', 'W&N', { strength: 1.5, opacity: 20, ci: 'PR254', lightfast: 'I', undertone: '#C23A28', staining: 'Medium' }),
      X('Cadmium Red Deep', '#B61E13', 'W&N', { strength: 1.1, opacity: 25, ci: 'PR108', lightfast: 'I', undertone: '#9F1B12', staining: 'Medium', toxic: true }),
      X('Permanent Magenta', '#B52B74', 'W&N', { strength: 2.0, opacity: 15, ci: 'PV19', lightfast: 'I', staining: 'High' }),
      X('Quinacridone Magenta', '#A5286C', 'W&N', { strength: 2.2, opacity: 15, ci: 'PR122', lightfast: 'I', staining: 'High' }),
      X('Dioxazine Violet', '#5B2A6F', 'W&N', { strength: 2.2, opacity: 20, ci: 'PV23', lightfast: 'II', staining: 'Medium' }),
      X('Cobalt Violet', '#8D4EA0', 'W&N', { strength: 0.9, opacity: 25, ci: 'PV14', lightfast: 'I', granulating: true, staining: 'Low', toxic: true }),
      X('Ultramarine Violet', '#5E4D8F', 'W&N', { strength: 1.0, opacity: 20, ci: 'PV15', lightfast: 'I', granulating: true, staining: 'Low' }),
      X('Indanthrone Blue', '#193470', 'W&N', { strength: 2.2, opacity: 15, ci: 'PB60', lightfast: 'I', staining: 'High' }),
      X('Prussian Blue', '#0C3E5C', 'W&N', { strength: 2.4, opacity: 20, ci: 'PB27', lightfast: 'I', undertone: '#0A5B4B', staining: 'High' }),
      X('Manganese Blue Hue', '#1685B5', 'W&N', { strength: 1.0, opacity: 30, ci: 'PB15', lightfast: 'I', staining: 'Medium' }),
      X('Cobalt Teal', '#38B7C9', 'W&N', { strength: 0.9, opacity: 30, ci: 'PG50', lightfast: 'I', granulating: true, staining: 'Low' }),
      X('Cobalt Turquoise', '#18A5AD', 'W&N', { strength: 1.0, opacity: 30, ci: 'PG50', lightfast: 'I', granulating: true, staining: 'Low', toxic: true }),
      X('Phthalo Turquoise', '#159AA0', 'W&N', { strength: 2.5, opacity: 15, ci: 'PB15/PG7', lightfast: 'I', staining: 'High' }),
      X('Cadmium Green', '#2F7F3C', 'W&N', { strength: 1.2, opacity: 25, ci: 'PG50', lightfast: 'II', staining: 'Low', toxic: true }),
      X('Yellow Green', '#7E9D33', 'W&N', { strength: 1.0, opacity: 20, ci: 'PY129', lightfast: 'II', staining: 'Medium' }),
      X('Green Gold', '#AB9B3C', 'W&N', { strength: 1.0, opacity: 20, ci: 'PY129', lightfast: 'I', staining: 'Low' }),
      X('Raw Umber', '#6C5434', 'W&N', { strength: 0.8, opacity: 25, ci: 'PBr7', lightfast: 'I', granulating: true, staining: 'Low' }),
      X('Transparent Oxide Red', '#9E3F27', 'W&N', { strength: 1.0, opacity: 20, ci: 'PR101', lightfast: 'I', staining: 'Medium' }),
      X('Van Dyke Brown', '#463422', 'W&N', { strength: 1.2, opacity: 25, ci: 'PBr8', lightfast: 'II', staining: 'Medium' }),
      X('Terre Verte', '#5B6852', 'W&N', { strength: 0.5, opacity: 25, ci: 'PG23', lightfast: 'I', granulating: true, staining: 'Low' }),
      X('Neutral Tint', '#3E4450', 'W&N', { strength: 1.4, opacity: 25, ci: 'PBk6/PV19', lightfast: 'II', staining: 'Medium' }),
      X('Indigo', '#2A3A6E', 'W&N', { strength: 1.8, opacity: 20, ci: 'PB60/PBk', lightfast: 'II', staining: 'High' }),
      X('Quinacridone Gold', '#C9822E', 'W&N', { strength: 1.2, opacity: 20, ci: 'PR206/PY42', lightfast: 'I', staining: 'Medium' }),
    ],
  };

  const STORAGE_KEY = 'pp.palettes';
  const CUSTOMS_KEY = 'pp.custom_palettes';
  const SELECTED_KEY = 'pp.palette';

  function readJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* ignore corrupt storage */ }
    return fallback;
  }

  function writeJSON(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* ignore */ }
  }

  const clone = (o) => JSON.parse(JSON.stringify(o));
  const num = (v, d) => (typeof v === 'number' && isFinite(v)) ? v : d;

  /* fill any fields missing on old saved paints (best effort from defaults) */
  function backfill(paints, defs) {
    const byName = (defs || []).reduce((m, p) => { m[p.name] = p; return m; }, {});
    return paints.map(p => {
      const d = byName[p.name] || {};
      return {
        name: p.name,
        hex: p.hex,
        brand: p.brand || d.brand || '',
        strength: num(p.strength, num(d.strength, 1)),
        opacity: num(p.opacity, num(d.opacity, 100)),
        ci: p.ci || d.ci || '',
        lightfast: p.lightfast || d.lightfast || 'II',
        undertone: p.undertone || p.hex || d.undertone || '',
        granulating: p.granulating != null ? !!p.granulating : !!(d.granulating),
        staining: p.staining || d.staining || 'None',
        toxic: p.toxic != null ? !!p.toxic : !!(d.toxic),
        enabled: p.enabled != null ? !!p.enabled : true,
      };
    });
  }

  /* the paint set a palette ships with (its own defaults, or the source
     medium's defaults for a custom palette) — used to tell core paints
     apart from user-added ones */
  function defaultPaints(id) {
    if (isCustomId(id)) {
      const src = customs()[id] && customs()[id].source;
      return (src && DEFAULTS[src]) || [];
    }
    return DEFAULTS[id] || [];
  }

  function overrides() { return readJSON(STORAGE_KEY, {}); }

  function customs() { return readJSON(CUSTOMS_KEY, {}); }

  function isCustomId(id) { return Object.prototype.hasOwnProperty.call(customs(), id); }

  const Palettes = {
    media: MEDIA,
    defaults: DEFAULTS,

    /* all selectable palettes: built-in media first, then customs */
    list() {
      const items = [];
      for (const id of Object.keys(MEDIA)) items.push({ id, label: MEDIA[id].label, custom: false });
      for (const id of Object.keys(customs())) items.push({ id, label: customs()[id].label, custom: true });
      return items;
    },

    getSelected() {
      const s = readJSON(SELECTED_KEY, 'oil');
      return this.list().some(p => p.id === s) ? s : 'oil';
    },

    setSelected(id) { writeJSON(SELECTED_KEY, id); },

    isCustom(id) { return isCustomId(id); },

    defaultPaints,

    /* returns { paints, medium, custom, label } for a palette id */
    get(id) {
      if (isCustomId(id)) {
        const c = customs()[id];
        return {
          paints: backfill(c.paints, c.source && DEFAULTS[c.source]),
          medium: clone(c.medium),
          custom: true,
          label: c.label,
        };
      }
      if (MEDIA[id]) {
        const saved = overrides()[id];
        const paints = backfill(
          (Array.isArray(saved) && saved.length) ? saved : DEFAULTS[id],
          DEFAULTS[id]
        );
        return { paints, medium: clone(MEDIA[id]), custom: false, label: MEDIA[id].label };
      }
      return { paints: clone(DEFAULTS.oil), medium: clone(MEDIA.oil), custom: false, label: MEDIA.oil.label };
    },

    /* store paints for a built-in (override) or custom palette */
    setPaints(id, paints) {
      if (isCustomId(id)) {
        const c = customs();
        if (c[id]) { c[id].paints = clone(paints); writeJSON(CUSTOMS_KEY, c); }
        return;
      }
      if (MEDIA[id]) {
        const o = overrides();
        o[id] = clone(paints);
        writeJSON(STORAGE_KEY, o);
      }
    },

    /* rename a custom palette (built-in names are fixed) */
    setLabel(id, label) {
      const c = customs();
      if (c[id]) {
        const trimmed = String(label || '').trim();
        if (trimmed) c[id].label = trimmed;
        writeJSON(CUSTOMS_KEY, c);
      }
    },

    /* create an editable copy of a palette; returns the new custom id */
    duplicate(id) {
      const src = this.get(id);
      const c = customs();
      let n = 1;
      while (c['custom_' + n]) n++;
      const cid = 'custom_' + n;
      const copyLabel = (global.I18N && global.I18N.t) ? global.I18N.t('paletteCopy') : 'Copy';
      c[cid] = {
        label: src.medium.label + ' ' + copyLabel,
        source: id,
        medium: src.medium,
        paints: src.paints,
      };
      writeJSON(CUSTOMS_KEY, c);
      return cid;
    },

    /* create a custom palette from explicit parts; returns the new id.
       used to resurrect a custom palette deleted since a history entry
       recorded its snapshot. */
    createCustom(label, medium, paints, source) {
      const c = customs();
      let n = 1;
      while (c['custom_' + n]) n++;
      const cid = 'custom_' + n;
      c[cid] = {
        label,
        source: source || null,
        medium: clone(medium),
        paints: clone(paints),
      };
      writeJSON(CUSTOMS_KEY, c);
      return cid;
    },

    removeCustom(id) {
      const c = customs();
      if (!c[id]) return;
      const source = c[id] && c[id].source;
      delete c[id];
      writeJSON(CUSTOMS_KEY, c);
      if (readJSON(SELECTED_KEY, '') === id) {
        // fall back to the deleted palette's parent: the built-in medium it
        // was based on (e.g. deleting a watercolour-based custom lands on the
        // built-in watercolour palette, not always on oil), or its source
        // custom palette if that still exists.
        const fallback = (source && (MEDIA[source] || isCustomId(source))) ? source : Object.keys(MEDIA)[0];
        writeJSON(SELECTED_KEY, fallback);
      }
    },

    /* revert paints: built-in -> defaults; custom -> its source medium's defaults */
    resetDefaults(id) {
      if (isCustomId(id)) {
        const c = customs();
        const src = c[id] && c[id].source;
        if (c[id] && src && MEDIA[src]) c[id].paints = clone(DEFAULTS[src]);
        writeJSON(CUSTOMS_KEY, c);
        return;
      }
      if (MEDIA[id]) {
        const o = overrides();
        delete o[id];
        writeJSON(STORAGE_KEY, o);
      }
    },
  };

  global.Palettes = Palettes;
})(window);
