// ponytail: зеркала Aliyun первыми - из Китая google()/mavenCentral() тормозят
pluginManagement {
    repositories {
        maven("https://maven.aliyun.com/repository/gradle-plugin")
        maven("https://maven.aliyun.com/repository/google")
        google(); mavenCentral(); gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositories {
        maven("https://maven.aliyun.com/repository/google")
        maven("https://maven.aliyun.com/repository/public")
        google(); mavenCentral()
    }
}
rootProject.name = "raspisanie"
include(":app")
