/**
 * 
 * @param {(...args: unknown[]) => Promise<unknown>} request 
 * @param {number} pageStart 
 * @param {number} pageFinish 
 * @param  {unknown[]} args 
 */
async function* requestPageGenerator(request, pageStart, pageFinish, ...args) {
    const filterArgs = args.findIndex((a) => typeof a === "object" && a["page[size]"] !== undefined);
    for (let pageCount = pageStart; pageCount <= pageFinish; pageCount++) {
        if (filterArgs > -1) {
            args[filterArgs]["page[number]"] = pageCount;
        }
        yield request(...args);
    }
}

async function getAllDataForRequestPromisified(sdkFunction, ...args) {
    let rawData;
    try {
        rawData = await sdkFunction(...args);
    } catch (e) {
        if (e.status === 429) {
            rawData = await sdkFunction(...args);
        }
    }

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

let another = Promise.resolve();
module.exports = {
    getAllDataForRequest: async function (sdkFunction, ...args) {
        return new Promise((res) => {
            another = another.then(() => {
                return getAllDataForRequestPromisified(sdkFunction, ...args).then(res);
            });
        }); 
    }
}