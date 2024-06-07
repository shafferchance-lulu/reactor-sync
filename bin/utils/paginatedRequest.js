async function* requestPageGenerator(request, pageStart, pageFinish, ...args) {
    let currentPage = pageStart + 1;
    while (currentPage <= pageFinish) {
        await new Promise((res) => setTimeout(res), Math.random() * 10)
        yield request(...args);
        currentPage++;
    }
}

module.exports = {
    getAllDataForRequest: async function (sdkFunction, ...args) {
        const rawData = await sdkFunction(...args);

        if (rawData.meta?.pagination) {
            const { current_page: currentPage, total_pages: totalPages } = rawData.meta.pagination;
            let data = [...rawData.data];
            for await (const request of requestPageGenerator(sdkFunction, currentPage, totalPages, ...args)) {
                data.push(...request.data);
            }
            return data;
        } else {
            return rawData.data;
        }
    }
}