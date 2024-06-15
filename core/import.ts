import { nanoid } from 'nanoid'
import { atom } from 'nanostores'

import {
  addCategory,
  type CategoryValue,
  type FeedsByCategory
} from './category.js'
import { addFeed, type FeedValue } from './feed.js'
import { readonlyExport } from './lib/stores.js'
import { createFeedFromUrl } from './preview.js'

let $importedFeedsByCategory = atom<FeedsByCategory>([])
export const importedFeedsByCategory = readonlyExport($importedFeedsByCategory)

let $importedCategories = atom<string[]>([])
let $importedFeeds = atom<string[]>([])
let $unLoadedFeeds = atom<string[]>([])

let $reading = atom<boolean>(false)
let $submiting = atom<boolean>(false)

let $importErrors = atom<string[]>([])

export const importedCategories = readonlyExport($importedCategories)
export const importedFeeds = readonlyExport($importedFeeds)
export const reading = readonlyExport($reading)
export const submiting = readonlyExport($submiting)
export const unLoadedFeeds = readonlyExport($unLoadedFeeds)
export const importErrors = readonlyExport($importErrors)

let $categories = atom<CategoryValue[]>([])
let $feeds = atom<FeedValue[]>([])

//$importedFeedsByCategor.subscribe() doesn't work when running tests, so I had to make a function and call
function importSubscribe(): void {
  $feeds.set(
    Array.from(
      new Set(
        $importedFeedsByCategory
          .get()
          .flatMap(([, feeds]) => feeds.map(feed => feed))
      )
    )
  )

  $categories.set(
    Array.from(
      new Set($importedFeedsByCategory.get().flatMap(([category]) => category))
    )
  )
}

export function selectAllImportedFeeds(): void {
  $importedCategories.set($categories.get().map(category => category.id))
  $importedFeeds.set($feeds.get().map(feed => feed.id))
}

export function clearImportSelections(): void {
  $importedCategories.set([])
  $importedFeeds.set([])
}

export function toggleImportedCategory(categoryId: string): void {
  let selectedCategories = new Set($importedCategories.get())
  let selectedFeeds = new Set($importedFeeds.get())

  let feeds = $feeds.get().filter(feed => feed.categoryId === categoryId)

  if (selectedCategories.has(categoryId)) {
    selectedCategories.delete(categoryId)
    feeds.forEach(feed => selectedFeeds.delete(feed.id))
  } else {
    selectedCategories.add(categoryId)
    feeds.forEach(feed => selectedFeeds.add(feed.id))
  }

  $importedCategories.set(Array.from(selectedCategories))
  $importedFeeds.set(Array.from(selectedFeeds))
}

export function toggleImportedFeed(feedId: string, categoryId: string): void {
  let selectedCategories = new Set($importedCategories.get())
  let selectedFeeds = new Set($importedFeeds.get())

  if (selectedFeeds.has(feedId)) {
    selectedFeeds.delete(feedId)
    let remainingFeedsInCategory = $feeds
      .get()
      .filter(
        feed => feed.categoryId === categoryId && selectedFeeds.has(feed.id)
      )
    if (remainingFeedsInCategory.length === 0) {
      selectedCategories.delete(categoryId)
    }
  } else {
    selectedFeeds.add(feedId)
    selectedCategories.add(categoryId)
  }

  $importedCategories.set(Array.from(selectedCategories))
  $importedFeeds.set(Array.from(selectedFeeds))
}

export function handleImportFile(file: File): Promise<void> {
  return new Promise(resolve => {
    $reading.set(true)
    $importErrors.set([])
    $importedFeedsByCategory.set([])
    importSubscribe()
    let reader = new FileReader()
    reader.onload = async function (e) {
      let content = e.target?.result as string
      let fileExtension = file.name.split('.').pop()?.toLowerCase()

      if (fileExtension === 'json') {
        try {
          let jsonData = JSON.parse(content)
          if (jsonData.type === 'feedsByCategory') {
            $importedFeedsByCategory.set(jsonData.data)
            importSubscribe()
            selectAllImportedFeeds()
          } else {
            $importErrors.set([
              ...$importErrors.get(),
              'Invalid JSON structure'
            ])
          }
        } catch (jsonError) {
          $importErrors.set(['Failed to parse JSON or invalid structure'])
        }
      } else if (fileExtension === 'opml') {
        try {
          let parser = new DOMParser()
          let xmlDoc = parser.parseFromString(content, 'text/xml')

          if (xmlDoc.documentElement.nodeName === 'opml') {
            let feedsByCategory: FeedsByCategory = []
            let outlines = xmlDoc.getElementsByTagName('outline')

            let generalCategory: CategoryValue = {
              id: 'general',
              title: 'General'
            }
            let generalFeeds: FeedValue[] = []

            let generalCategoryExists = false

            for (let i = 0; i < outlines.length; i++) {
              let outline = outlines[i]
              if (outline?.parentElement) {
                if (
                  outline.parentElement.nodeName === 'body' &&
                  outline.children.length > 0
                ) {
                  let categoryTitle = outline.getAttribute('text')!
                  let categoryId =
                    categoryTitle === 'General'
                      ? categoryTitle.toLowerCase()
                      : nanoid()

                  if (categoryId === 'general') {
                    generalCategoryExists = true
                  }

                  let category: CategoryValue = {
                    id: categoryId,
                    title: categoryTitle
                  }
                  let feeds: FeedValue[] = []

                  let childOutlines = outline.children
                  for (let j = 0; j < childOutlines.length; j++) {
                    let feedOutline = childOutlines[j]
                    let feedUrl = feedOutline?.getAttribute('xmlUrl')
                    if (feedUrl) {
                      try {
                        let feed = await createFeedFromUrl(feedUrl, category.id)
                        feeds.push(feed)
                      } catch (error) {
                        $unLoadedFeeds.set([...$unLoadedFeeds.get(), feedUrl])
                      }
                    }
                  }
                  feedsByCategory.push([category, feeds])
                } else if (
                  outline.parentElement.nodeName === 'body' &&
                  outline.getAttribute('xmlUrl')
                ) {
                  let feedUrl = outline.getAttribute('xmlUrl')
                  if (feedUrl) {
                    try {
                      let feed = await createFeedFromUrl(
                        feedUrl,
                        generalCategory.id
                      )
                      generalFeeds.push(feed)
                    } catch (error) {
                      $unLoadedFeeds.set([...$unLoadedFeeds.get(), feedUrl])
                    }
                  }
                }
              }
            }

            if (generalCategoryExists) {
              for (let i = 0; i < feedsByCategory.length; i++) {
                let categoryFeeds = feedsByCategory[i]
                if (categoryFeeds && categoryFeeds[0].id === 'general') {
                  categoryFeeds[1].push(...generalFeeds)
                  break
                }
              }
            } else {
              feedsByCategory.push([generalCategory, generalFeeds])
            }

            $importedFeedsByCategory.set(feedsByCategory)
            importSubscribe()
            selectAllImportedFeeds()
          } else {
            $importErrors.set(['File is not in OPML format'])
          }
        } catch (xmlError) {
          $importErrors.set(['File is not in OPML format'])
        }
      } else {
        $importErrors.set(['Unsupported file format'])
      }

      $reading.set(false)
      if (!e.target?.error) {
        resolve()
      }
    }
    reader.readAsText(file)
  })
}

export async function submitImport(): Promise<void> {
  $submiting.set(true)
  let categoryPromises = []
  let feedPromises = []

  for (let item of $importedFeedsByCategory.get()) {
    let category = item[0]
    let feeds = item[1]

    if (category.id !== 'general') {
      categoryPromises.push(addCategory({ title: category.title }))
    }

    for (let feed of feeds) {
      feedPromises.push(addFeed(feed))
    }
  }

  await Promise.all(categoryPromises)
  await Promise.all(feedPromises)

  $importedFeedsByCategory.set([])
  $importedCategories.set([])
  $importedFeeds.set([])
  importSubscribe()
  $unLoadedFeeds.set([])
  $submiting.set(false)
}
