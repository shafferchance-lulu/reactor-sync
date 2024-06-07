export async function* requestPageGenerator(request, pageStart, pageFinish, ...args) {
    let currentPage = pageStart + 1;
    while (currentPage <= pageFinish) {
        yield request(...args);
      currentPage++;
    }
}

export async function getAllDataForRequest(sdkFunction, ...args) {
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