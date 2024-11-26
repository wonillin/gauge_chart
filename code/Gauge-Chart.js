import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7/+esm';
import { getEncodedData, calculateFogColor } from './utils.js';

let data = [];

let selectedTupleIds = new Set();
let hoveredTupleId;

window.onload = async () => {
  try {
    // Tableau Extensions API 초기화
    await tableau.extensions.initializeAsync();

    // 데이터 로드 및 렌더링
    await window.fetchDataAndRender();

    // 이벤트 리스너 추가
    addEventListeners();
  } catch (error) {
    console.error('Initialization Error:', error);
  }
};

function getWorksheet() {
  try {
    // 워크시트 가져오기
    return tableau.extensions.worksheetContent.worksheet;
  } catch (error) {
    console.error('Worksheet Selection Error:', error);
    throw error;
  }
}

window.fetchDataAndRender = async function () {
  try {
    let worksheet = getWorksheet();
    
    // 데이터 로드 (needleValue 필드 명시)
    data = await getEncodedData(worksheet, ['needleValue']);
    
    console.log('Raw Data:', data);

    // 데이터 유효성 검사
    if (data && data.length > 0 && data[0].needleValue) {
      window.renderGaugeChart(data);
    } else {
      console.warn('No valid data found');
    }
  } catch (error) {
    console.error('Data Fetching Error:', error);
  }
};

function addEventListeners() {
  let worksheet = getWorksheet();

  // 데이터 변경 시 다시 로드
  worksheet.addEventListener(
    tableau.TableauEventType.SummaryDataChanged, 
    window.fetchDataAndRender
  );

  // 창 크기 변경 시 다시 렌더링
  window.onresize = () => {
    if (data && data.length > 0) {
      window.renderGaugeChart(data);
    }
  };
}

window.renderGaugeChart = async function (data) {
  try {
    const container = document.getElementById('my_dataviz');
    container.innerHTML = '';

    let width = container.clientWidth;
    let height = container.clientHeight;
    let margin = 20;
    let radius = Math.min(width, height) / 2 - margin;

    // 데이터 처리 (needleValue 추출)
    let needleValue = data[0].needleValue 
      ? parseFloat(data[0].needleValue[0].value) 
      : 0;

    console.log('Needle Value:', needleValue);

    // 0-1 사이 값으로 제한
    needleValue = Math.max(0, Math.min(1, needleValue));

    // 색상 구간 설정
    const colorScale = d3
      .scaleLinear()
      .domain([0, 0.25, 0.5, 0.75, 1])
      .range(["#00C853", "#00E5FF", "#FFD600", "#FF6D00", "#DD2C00"]);

    // 아크 생성
    const arcGenerator = d3
      .arc()
      .innerRadius(radius * 0.7)
      .outerRadius(radius)
      .startAngle((d, i) => (i * Math.PI) / 5 - Math.PI / 2)
      .endAngle((d, i) => ((i + 1) * Math.PI) / 5 - Math.PI / 2);

    // 아크 데이터
    const arcData = [0, 0.25, 0.5, 0.75, 1];

    // SVG 생성
    let svg = d3
      .select(container)
      .append('svg')
      .attr('width', width)
      .attr('height', height)
      .append('g')
      .attr('transform', `translate(${width / 2},${height - margin})`);

    // 아크 그리기
    svg
      .selectAll("path")
      .data(arcData)
      .enter()
      .append("path")
      .attr("d", arcGenerator)
      .attr("fill", (d) => colorScale(d));

    // 바늘 각도 계산
    const needleAngle = needleValue * Math.PI - Math.PI;

    // 바늘 그리기
    svg
      .append("line")
      .attr("x1", 0)
      .attr("y1", 0)
      .attr("x2", radius * 0.8 * Math.cos(needleAngle))
      .attr("y2", radius * 0.8 * Math.sin(needleAngle))
      .attr("stroke", "black")
      .attr("stroke-width", 3)
      .attr("stroke-linecap", "round");

    // 중앙 텍스트
    svg
      .append("text")
      .attr("x", 0)
      .attr("y", -radius * 0.25)
      .attr("text-anchor", "middle")
      .style("font-size", "24px")
      .style("font-weight", "bold")
      .text(`${(needleValue * 100).toFixed(1)}%`);

  } catch (error) {
    console.error('Rendering Error:', error);
  }
};