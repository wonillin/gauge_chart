import tinycolor from 'https://esm.sh/tinycolor2';

// Uses getVisualSpecificationAsync to build a map of encoding identifiers (specified in the .trex file)
// to fields that the user has placed on the encoding's shelf.
// Only encodings that have fields dropped on them will be part of the encodingMap.
export function getEncodingMap(visualSpec) {
  const encodingMap = {};

  if (visualSpec.activeMarksSpecificationIndex < 0) return encodingMap;

  const marksCard = visualSpec.marksSpecifications[visualSpec.activeMarksSpecificationIndex];
  for (const encoding of marksCard.encodings) {
    if (!encodingMap[encoding.id]) encodingMap[encoding.id] = [];

    encodingMap[encoding.id].push(encoding.field);
  }

  return encodingMap;
}

// Go through all selected marks and find their exact match in the data table
// Use the index of the mark in the data table to compute tupleId
export function findIdsOfMarks(allMarks, selectedMarks) {
  const selectedMarkMap = new Map();
  const selectedMarksIds = new Set();

  if (selectedMarks.data.length === 0) return selectedMarksIds;

  // selectedMarks.data is a collection of data tables.
  // Each row in each data table represents a single mark on the viz.
  // However, viz extensions can only be used in scenarios, where there is only one marks table
  // So we take first one and iterate over it
  // Different logic needs to be used when viz extension start supporting multiple mark table (e.g. dual axis or layers)
  const columns = selectedMarks.data[0].columns;

  for (const selectedMark of convertToListOfNamedRows(selectedMarks.data[0])) {
    let key = '';
    for (const col of columns) {
      key += selectedMark[col.fieldName].value + '\x00';
    }

    selectedMarkMap.set(key, selectedMark);
  }

  let tupleId = 1;
  for (const mark of allMarks) {
    let key = '';
    for (const col of columns) {
      key += mark[col.fieldName].value + '\x00';
    }

    if (selectedMarkMap.has(key)) {
      selectedMarksIds.add(tupleId);
    }

    tupleId++;
  }

  return selectedMarksIds;
}

// Takes a page of data, which has a list of DataValues (dataTablePage.data)
// and a list of columns and puts the data in a list where each entry is an
// object that maps from field names to DataValues
// (example of a row being: { SUM(Sales): ..., SUM(Profit): ..., Ship Mode: ..., })
function convertToListOfNamedRows(dataTablePage) {
  const rows = [];
  const columns = dataTablePage.columns;
  const data = dataTablePage.data;
  for (let i = 0; i < data.length; ++i) {
    const row = { $tupleId: i + 1 };
    for (let j = 0; j < columns.length; ++j) {
      row[columns[j].fieldName] = data[i][columns[j].index];
    }
    rows.push(row);
  }
  return rows;
}

// Gets each page of data in the summary data and returns a list of rows of data
// associated with field names.
export async function getSummaryDataTable(worksheet) {
  let rows = [];

  // Tableau Extensions API Call:
  // "Gets a summary data table reader for this worksheet"
  const dataTableReader = await worksheet.getSummaryDataReaderAsync(undefined, {
    ignoreSelection: true,
  });
  for (let currentPage = 0; currentPage < dataTableReader.pageCount; currentPage++) {
    const dataTablePage = await dataTableReader.getPageAsync(currentPage);
    rows = rows.concat(convertToListOfNamedRows(dataTablePage));
  }
  await dataTableReader.releaseAsync();

  return rows;
}

// Converts each data row from a <field_name, DataValues> object map to a <encoding_name, DataValues[]> object map
// For example,  { SUM(Sales): 10.23, Ship Mode: 'Next Day', Category: 'Office Supplies' } will be converted to
// { edge: [10.23], levels: ['Next Day', 'Office Supplies']  } if SUM(Sales) is on the edge encoding and Ship Mode ad Category are on the level encoding
export async function getDataAndVisualSpec(worksheet) {
  const encodedData = [];

  // Use extensions API to update the table of data and the map from encodings to fields

  // Tableau Extensions API Call:
  // "Returns the visual specification for the worksheet, which can be used to get the mappings from fields to encodings backing the visual within the worksheet"
  const [originalData, visualSpec] = await Promise.all([getSummaryDataTable(worksheet), worksheet.getVisualSpecificationAsync()]);

  const encodingMap = getEncodingMap(visualSpec);

  let tupleId = 1;
  for (const row of originalData) {
    const encodedRow = { $tupleId: tupleId };

    for (const encName in encodingMap) {
      const fields = encodingMap[encName];

      encodedRow[encName] = [];

      for (const field of fields) {
        encodedRow[encName].push(row[field.name]);
      }
    }

    tupleId++;

    encodedData.push(encodedRow);
  }

  return { originalData, encodedData, visualSpec, encodingMap };
}

export async function getEncodedData(worksheet) {
  return (await getDataAndVisualSpec(worksheet)).encodedData;
}

export async function getSelectedMarks(worksheet, allMarks) {
  // Tableau Extensions API Call:
  // Get the currently selected marks on the worksheet
  const selectedMarks = await worksheet.getSelectedMarksAsync();

  return findIdsOfMarks(allMarks, selectedMarks);
}

export async function getEncodedDataAndSelectedTuples(worksheet) {
  const results = await getDataAndVisualSpec(worksheet);
  const selectedTupleIds = await getSelectedMarks(worksheet, results.originalData);

  return { data: results.encodedData, selectedTupleIds };
}

const backgroundColor = tinycolor('white');

const fogBlendFactor = getFogBlendFactor(backgroundColor);
const { foggedBackgroundRed, foggedBackgroundGreen, foggedBackgroundBlue } = computeFoggedBackgroundColor(backgroundColor, fogBlendFactor);

// When one or more elements are selected, everything else is fogged out.
function computeFoggedBackgroundColor(color, fogBlendFactor) {
  const CloseToWhite = 245;

  let rgbColor = color.toRgb();

  if (rgbColor.r >= CloseToWhite && rgbColor.g >= CloseToWhite && rgbColor.b >= CloseToWhite) {
    rgbColor = tinycolor({
      r: CloseToWhite,
      g: CloseToWhite,
      b: CloseToWhite,
    }).toRgb();
  }

  const foggedBackgroundRed = ((1 - fogBlendFactor) * rgbColor.r) >>> 0;
  const foggedBackgroundGreen = ((1 - fogBlendFactor) * rgbColor.g) >>> 0;
  const foggedBackgroundBlue = ((1 - fogBlendFactor) * rgbColor.b) >>> 0;

  return { foggedBackgroundRed, foggedBackgroundGreen, foggedBackgroundBlue };
}

export function calculateFogColor(colorStr) {
  const color = tinycolor(colorStr).toRgb();

  const fogR = (foggedBackgroundRed + color.r * fogBlendFactor) >>> 0;
  const fogG = (foggedBackgroundGreen + color.g * fogBlendFactor) >>> 0;
  const fogB = (foggedBackgroundBlue + color.b * fogBlendFactor) >>> 0;

  return tinycolor({ r: fogR, g: fogG, b: fogB }).toHexString();
}

function getFogBlendFactor(color) {
  const rgbColor = color.toRgb();

  const DefaultFogBlendFactor = 0.1850000023841858;
  const DarkBgFogBlendFactor = 0.2750000059604645;
  const DarkBgThreshold = 75;
  const isDarkBackground = rgbColor.r <= DarkBgThreshold && rgbColor.g <= DarkBgThreshold && rgbColor.b <= DarkBgThreshold;
  return isDarkBackground ? DarkBgFogBlendFactor : DefaultFogBlendFactor;
}
