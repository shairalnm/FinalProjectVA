////////////////////////////////////////////////////////////
//// Process Data //////////////////////////////////////////
////////////////////////////////////////////////////////////
Promise.all([
  d3.csv("https://raw.githubusercontent.com/Sbarj130917/LendingTree_D3JS/master/final_UNCC_sampled.csv"),
  d3.json("https://raw.githubusercontent.com/Sbarj130917/LendingTree_D3JS/master/us-10m.json"),
  d3.tsv("https://raw.githubusercontent.com/Sbarj130917/LendingTree_D3JS/master/state_ids.tsv")
]).then(([dataCSV, us, stateIds]) => {
  dataCSV.forEach(d => {
    d["Visit Number"] = +d["Visit Number"];
    d["GeoSegmentation States"] = d["GeoSegmentation States"]
      .trim()
      .split(" ")
      .map(word => word[0].toUpperCase() + word.slice(1))
      .join(" ");
    d["FormStart (ev57) (event57)"] = +d["FormStart (ev57) (event57)"];
    d["Form Engagement 1 (ev11) (event11)"] = +d[
      "Form Engagement 1 (ev11) (event11)"
    ];
    d["Form Engagement 2 (ev12) (event12)"] = +d[
      "Form Engagement 2 (ev12) (event12)"
    ];
    d["Form Conversion (ev59) (event59)"] = +d[
      "Form Conversion (ev59) (event59)"
    ];
    d["FormSubmit in Express Offers (ev58) (event58)"] = +d[
      "FormSubmit in Express Offers (ev58) (event58)"
    ];
  });

  const allProductFinancingOptions = ["All"].concat(
    d3
      .set(dataCSV, d => d["Product Reporting"])
      .values()
      .sort(d3.ascending)
  );

  const allStates = ["All"].concat(
    d3
      .set(dataCSV, d => d["GeoSegmentation States"])
      .values()
      .sort(d3.ascending)
  );

  const stateCodeToNameMap = stateIds.reduce((map, state) => {
    map[state.id] = state.name;
    return map;
  }, {});

  const choroplethData = d3.map();
  const funnelData = d3.map();
  ////////////////////////////////////////////////////////////
  //// Initial Setup /////////////////////////////////////////
  ////////////////////////////////////////////////////////////
  // Containers
  const choroplethChartContainer = d3.select(".choropleth-chart");
  const choroplethChartTitle = choroplethChartContainer
    .append("div")
    .attr("class", "text-center pt-3 h3")
    .text("Geographic Distribution of Visits");
  const choroplethChartChart = choroplethChartContainer
    .append("div")
    .attr("class", "chart-container");
  const funnelChartContainer = d3.select(".funnel-chart");
  const funnelChartTitle = funnelChartContainer
    .append("div")
    .attr("class", "text-center pt-3 h3")
    .text("Form Interaction Funnel in All");
  const funnelChartChart = funnelChartContainer
    .append("div")
    .attr("class", "chart-container");
  const tooltip = d3.select(".chart-tooltip");

  // Chart
  let choroplethChart;
  let funnelChart;

  // Filters
  const filter = {
    productReportingFilter: "All",
    stateFilter: "All"
  };

  // Styles
  const choroplethColor = d3.interpolateGreens;
  const funnelColor = d3.interpolateGreens;

  ////////////////////////////////////////////////////////////
  //// Control ///////////////////////////////////////////////
  ////////////////////////////////////////////////////////////
  const sideBar = d3
    .select(".side-bar")
    .classed("d-flex justify-content-center", true);

  // Product reporting filter
  const productReportingFilter = sideBar
    .append("fieldset")
    .attr("class", "form-group col-4");
  productReportingFilter.append("label").text("Select Product Reporting");
  productReportingFilter
    .append("select")
    .attr("class", "custom-select")
    .selectAll("option")
    .data(allProductFinancingOptions)
    .enter()
    .append("option")
    .attr("value", d => d)
    .text(d => d);
  productReportingFilter.select("select").on("change", function() {
    filter.productReportingFilter = this.value;
    choroplethChart.update();
    funnelChart.update();
  });

  // State filter
  const stateFilter = sideBar
    .append("fieldset")
    .attr("class", "form-group col-4");
  stateFilter.append("label").text("Select State");
  stateFilter
    .append("select")
    .attr("class", "custom-select")
    .selectAll("option")
    .data(allStates)
    .enter()
    .append("option")
    .attr("value", d => d)
    .text(d => d);
  stateFilter.select("select").on("change", function() {
    filter.stateFilter = this.value;
    funnelChart.update();
    funnelChartTitle.text("Form Interaction Funnel in " + this.value);
  });

  ////////////////////////////////////////////////////////////
  //// Choropleth ////////////////////////////////////////////
  ////////////////////////////////////////////////////////////
  choroplethChart = renderChoroplethChart(choroplethChartChart);

  function renderChoroplethChart(container, containerWidth, containerHeight) {
    const width = container.node().clientWidth || containerWidth;
    const height = container.node().clientHeight || containerHeight;

    const states = topojson.feature(us, us.objects.states);
    const projection = d3.geoAlbersUsa().fitSize([width, height], states);
    const path = d3.geoPath().projection(projection);
    const colorScale = d3.scaleSequential(choroplethColor);

    const svg = container
      .append("svg")
      .attr("width", width)
      .attr("height", height);

    const statePath = svg
      .selectAll("path")
      .data(states.features, d => d.id)
      .enter()
      .append("path")
      .attr("d", path)
      .attr("stroke", "#999")
      .attr("stroke-width", 0.5)
      .attr("fill", "#fff")
      .style("cursor", "pointer")
      .each(d => (d.properties.name = stateCodeToNameMap[d.id]))
      .on("mouseover", function(d) {
        d3.select(this)
          .raise()
          .attr("stroke", "#000")
          .attr("stroke-width", 1);
        showChoroplethTooltip(d);
      })
      .on("mousemove", moveTooltip)
      .on("mouseout", function() {
        d3.select(this)
          .attr("stroke", "#999")
          .attr("stroke-width", 0.5);
        hideTooltip();
      })
      .on("click", d => {
        filter.stateFilter = d.properties.name;
        funnelChart.update();
        funnelChartTitle.text(
          "Form Interaction Funnel in " + d.properties.name
        );
        stateFilter.select("select").node().value = d.properties.name;
      });

    const chart = {};
    chart.update = function() {
      // Update data
      let data;
      if (choroplethData.has(filter.productReportingFilter)) {
        data = choroplethData.get(filter.productReportingFilter);
      } else {
        const filteredRows = filterProductReporting(
          dataCSV,
          filter.productReportingFilter
        );

        data = d3
          .nest()
          .key(d => d["GeoSegmentation States"])
          .rollup(leaves => d3.sum(leaves, leaf => leaf["Visit Number"]))
          .map(filteredRows);

        choroplethData.set(filter.productReportingFilter, data);
      }

      // Update scale
      colorScale.domain([
        0,
        d3.max(data.values()) / 0.75 // Increase the max value to avoid the darkest blue color
      ]);

      // Update map
      statePath
        .each(
          d =>
            (d.properties.value = data.has(d.properties.name)
              ? data.get(d.properties.name)
              : 0)
        )
        .attr("fill", d => colorScale(d.properties.value));
    };
    return chart;
  }

  choroplethChart.update();
  ////////////////////////////////////////////////////////////
  //// funnel ////////////////////////////////////////////////
  ////////////////////////////////////////////////////////////
  funnelChart = renderFunnelChart(funnelChartChart);

  function renderFunnelChart(container, containerWidth, containerHeight) {
    const margin = { top: 50, right: 55, bottom: 50, left: 180 };
    const width =
      (container.node().clientWidth || containerWidth) -
      margin.left -
      margin.right;
    const height =
      (container.node().clientHeight || containerHeight) -
      margin.top -
      margin.bottom;

    const x = d3.scaleLinear().range([0, width]);

    const colorScale = d3.scaleSequential(funnelColor).domain([
      0,
      1 / 0.75 // Increase the max value to avoid the darkest color
    ]);

    const funnelSegments = [
      "FormStart (ev57) (event57)",
      "Form Engagement 1 (ev11) (event11)",
      "Form Engagement 2 (ev12) (event12)",
      "Form Conversion (ev59) (event59)",
      "FormSubmit in Express Offers (ev58) (event58)"
    ];

    const funnelSegmentsDisplay = [
      "FormStart",
      "FormEngagement1",
      "FormEngagement2",
      "FormConversion",
      "FormSubmit"
    ];

    const y = d3
      .scaleBand()
      .domain(funnelSegments)
      .range([0, height]);

    const yAxis = d3
      .axisLeft()
      .scale(y)
      .tickSize(0)
      .tickFormat((d, i) => funnelSegmentsDisplay[i]);

    const svg = container
      .append("svg")
      .attr("width", width + margin.left + margin.right)
      .attr("height", height + margin.top + margin.bottom);

    const g = svg
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    const bars = g.append("g");

    g.append("g")
      .attr("transform", "translate(-60, 0)")
      .call(yAxis)
      .select(".domain")
      .remove();

    const chart = {};
    chart.update = function() {
      // Update data
      let data;
      if (funnelData.has(filter.productReportingFilter + filter.stateFilter)) {
        data = funnelData.get(
          filter.productReportingFilter + filter.stateFilter
        );
      } else {
        let filteredRows = filterProductReporting(
          dataCSV,
          filter.productReportingFilter
        );
        filteredRows = filterState(filteredRows, filter.stateFilter);

        const formStartTotal = d3.sum(filteredRows, d => d[funnelSegments[0]]);
        data = funnelSegments.map(segment => {
          const value = d3.sum(filteredRows, d => d[segment]);
          const color = colorScale(value / formStartTotal);
          return {
            key: segment,
            value: value,
            total: formStartTotal,
            color: color
          };
        });

        funnelData.set(
          filter.productReportingFilter + filter.stateFilter,
          data
        );
      }

      x.domain([0, data[0].total]);

      const bar = bars.selectAll("g").data(data, d => d.key);

      const barEnter = bar
        .enter()
        .append("g")
        .attr("transform", d => `translate(0, ${y(d.key)})`);

      barEnter
        .append("rect")
        .attr("class", "bar-rect")
        .attr("fill", d => d.color)
        .attr("x", width / 2)
        .attr("y", 0.5)
        .attr("width", 0)
        .attr("height", y.bandwidth() - 1)
        .attr("stroke", d => d.color)
        .attr("stroke-width", 1)
        .on("mouseover", function(d) {
          d3.select(this).attr("stroke", "#000");
          // showBarTooltip(d);
        })
        .on("mousemove", moveTooltip)
        .on("mouseout", function() {
          d3.select(this).attr("stroke", d => d.color);
          hideTooltip();
        });

      barEnter
        .append("text")
        .attr("class", "bar-value")
        .attr("x", width / 2)
        .attr("y", y.bandwidth() / 2)
        .attr("dy", "0.35em")
        .attr("dx", -3)
        .attr("text-anchor", "end");

      barEnter
        .append("text")
        .attr("class", "bar-percentage")
        .attr("x", width / 2)
        .attr("y", y.bandwidth() / 2)
        .attr("dy", "0.35em")
        .attr("dx", 3)
        .attr("text-anchor", "start");

      const barMerge = barEnter
        .merge(bar)
        .transition()
        .duration(500);

      barMerge
        .select(".bar-rect")
        .attr("x", d => width / 2 - x(d.value) / 2)
        .attr("width", d => x(d.value));

      barMerge
        .select(".bar-value")
        .attr("x", d => width / 2 - x(d.value) / 2)
        .text(d => d3.format(",")(d.value));

      barMerge
        .select(".bar-percentage")
        .attr("x", d => width / 2 + x(d.value) / 2)
        .text(d => d3.format(".2%")(d.value / d.total));

      bar.exit().remove();
    };
    return chart;
  }

  funnelChart.update();

  ////////////////////////////////////////////////////////////
  //// Tooltip ///////////////////////////////////////////////
  ////////////////////////////////////////////////////////////
  function showChoroplethTooltip(d) {
    tooltip.html(`
          <div>State: <b>${d.properties.name}</b></div>
          <div>Total Visit: <b>${d3.format(",")(d.properties.value)}</b></div>
          <div>Top Source of Visit: <b>Google</b></div>
        `);
    tooltip.style("opacity", 1);
  }

  // function showBarTooltip(d) {
  //   tooltip.html(`
  //         <div>State: <b>${filter.stateFilter}</b></div>
  //         <div>Segment: <b>${d.key}</b></div>
  //         <div>Segment Count: <b>${d3.format(",")(d.value)}</b></div>
  //         <div>Total Count: <b>${d3.format(",")(d.total)}</b></div>
  //         <div>Percentage: <b>${d3.format(".2%")(d.value / d.total)}</b></div>
  //       `);
  //   tooltip.style("opacity", 1);
  // }

  function moveTooltip() {
    const rect = tooltip.node().getBoundingClientRect();
    tooltip
      .style("left", d3.event.clientX - rect.width / 2 + "px")
      .style("top", d3.event.clientY + 20 + "px");
  }

  function hideTooltip() {
    tooltip.style("opacity", 0);
  }

  ////////////////////////////////////////////////////////////
  //// Utilities /////////////////////////////////////////////
  ////////////////////////////////////////////////////////////
  function filterState(data, stateFilter) {
    if (stateFilter === "All") {
      return data;
    } else {
      return data.filter(d => d["GeoSegmentation States"] === stateFilter);
    }
  }

  function filterProductReporting(data, productReportingFilter) {
    if (productReportingFilter === "All") {
      return data;
    } else {
      return data.filter(
        d => d["Product Reporting"] === productReportingFilter
      );
    }
  }
});
